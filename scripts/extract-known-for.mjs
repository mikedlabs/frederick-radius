#!/usr/bin/env node
/**
 * extract-known-for.mjs — derive "known for" + "customers loved" tags
 * for every place that has usable Google review/editorial data.
 *
 * Why:
 *   We have 678 places with editorial_summary + review_snippet but the
 *   /places/[slug] page only renders the raw snippet. That's one
 *   un-curated review — not the same as "here's the SIGNAL: what is
 *   this place actually known for, and what specific items do
 *   customers rave about?"
 *
 *   This script reads the existing per-place text, hands it to the AI
 *   Gateway with a strict instruction, and emits structured tags.
 *
 * Output:
 *   src/data/known-for.json — sidecar file keyed by slug. Idempotent;
 *   re-running only processes slugs not yet in the file. Pass --force
 *   to re-process everything.
 *
 * Cost:
 *   gpt-4o-mini is ~$0.15/1M input + $0.60/1M output. Per-place call
 *   is ~250 input + ~80 output tokens, so one full pass on 678 places
 *   is roughly 678 × ($0.0000375 + $0.000048) ≈ $0.058. Trivial.
 *
 * Usage:
 *   node --env-file=.env.local scripts/extract-known-for.mjs
 *   node --env-file=.env.local scripts/extract-known-for.mjs --limit=50
 *   node --env-file=.env.local scripts/extract-known-for.mjs --live --confirm --limit=50
 *   node --env-file=.env.local scripts/extract-known-for.mjs --live --confirm --limit=50 --force
 *
 * The first two forms are zero-cost previews. A paid run always requires the
 * explicit live/confirm/limit trio and can never exceed the immutable ceiling.
 */

import fs from "node:fs";
import path from "node:path";
import { generateObject } from "ai";
import { z } from "zod";

const ROOT = process.cwd();
const ENRICH = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/places-enrichment.json"), "utf8"),
);
const DFP = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/places-dfp.json"), "utf8"),
);
const OUT_PATH = path.join(ROOT, "src/data/known-for.json");

const DEFAULT_PREVIEW_LIMIT = 50;
const MAX_MODEL_CALLS_PER_RUN = 250;

export function parseRunArgs(rawArgs) {
  const allowedFlags = new Set([
    "--live",
    "--confirm",
    "--force",
    "--dry-run",
    "--plan",
  ]);
  let limit;
  let limitSeen = false;

  for (let index = 0; index < rawArgs.length; index++) {
    const arg = rawArgs[index];
    if (allowedFlags.has(arg)) continue;
    if (arg === "--limit") {
      if (limitSeen) throw new Error("--limit may be provided only once.");
      const value = rawArgs[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--limit requires a positive whole number.");
      }
      limit = value;
      limitSeen = true;
      index++;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      if (limitSeen) throw new Error("--limit may be provided only once.");
      limit = arg.slice("--limit=".length);
      limitSeen = true;
      continue;
    }
    throw new Error(`Unknown option ${arg}. Refusing to start paid maintenance.`);
  }

  for (const flag of allowedFlags) {
    if (rawArgs.filter((arg) => arg === flag).length > 1) {
      throw new Error(`${flag} may be provided only once.`);
    }
  }

  const live = rawArgs.includes("--live");
  const confirmed = rawArgs.includes("--confirm");
  const explicitPlan = rawArgs.includes("--dry-run") || rawArgs.includes("--plan");
  if (live !== confirmed) {
    throw new Error("Paid extraction requires both --live and --confirm.");
  }
  if (live && explicitPlan) {
    throw new Error("A planning flag cannot be combined with --live.");
  }
  if (live && !limitSeen) {
    throw new Error("A paid extraction requires an explicit --limit N ceiling.");
  }

  const parsedLimit = limitSeen ? Number(limit) : DEFAULT_PREVIEW_LIMIT;
  if (limitSeen && !/^[1-9]\d*$/.test(String(limit))) {
    throw new Error("--limit must be a positive whole number.");
  }
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1) {
    throw new Error("--limit must be a positive safe integer.");
  }
  if (parsedLimit > MAX_MODEL_CALLS_PER_RUN) {
    throw new Error(
      `--limit cannot exceed the immutable ${MAX_MODEL_CALLS_PER_RUN}-call ceiling.`,
    );
  }

  return {
    live,
    confirmed,
    dryRun: !live,
    force: rawArgs.includes("--force"),
    limit: parsedLimit,
  };
}

const ResultSchema = z.object({
  known_for: z
    .array(z.string().min(2).max(40))
    .min(0)
    .max(4)
    .describe(
      'What the place is known for. 2-4 short phrases ("wood-fired pizza", "craft beer selection", "kid-friendly playground"). Empty array if signal is too weak.',
    ),
  customers_loved: z
    .array(z.string().min(2).max(40))
    .min(0)
    .max(4)
    .describe(
      'Specific items or experiences customers rave about, as named in the review ("crab croquetas", "carriage rides", "the espresso martini"). Empty if review is generic.',
    ),
});

async function extractOne(name, editorial, review) {
  const { object } = await generateObject({
    model: "openai/gpt-4o-mini",
    // The command's --limit is a provider-attempt ceiling, not just a count of
    // input rows. Disable SDK retries so one candidate cannot silently turn
    // into several paid model attempts, and bound both latency and output.
    maxRetries: 0,
    maxOutputTokens: 256,
    abortSignal: AbortSignal.timeout(20_000),
    schema: ResultSchema,
    prompt: `You are extracting structured tags from a Google Maps listing for "${name}".

EDITORIAL_SUMMARY (Google's own short description):
${editorial || "(none)"}

CUSTOMER_REVIEW (a top review snippet):
${review || "(none)"}

Rules:
- known_for = 2-4 short phrases describing what THE PLACE is known for (food type, ambiance, experience). Generic "good place to visit" doesn't count — pick concrete attributes.
- customers_loved = 2-4 SPECIFIC items, dishes, or experiences named in the review ("the crab croquetas", "live jazz on Fridays"). Quote items as they appear in the review. Empty array if the review is generic praise with no specifics.
- Use lowercase except for proper nouns. No periods at the end.
- If the inputs are too thin to extract real signal, return empty arrays — better to skip than invent.`,
  });
  return object;
}

async function main() {
  const run = parseRunArgs(process.argv.slice(2));
  if (
    run.live &&
    (process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL !==
      "written-google-authorization-confirmed" ||
      process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED !== "1")
  ) {
    throw new Error(
      "Google-derived tag extraction is on policy hold. Record reviewed written authorization and enable the Google Maps Platform runtime before deriving new tags.",
    );
  }

  // AI Gateway uses VERCEL_OIDC_TOKEN at runtime. Planning never requires a
  // credential and never touches the model or output file.
  if (run.live && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error("VERCEL_OIDC_TOKEN missing. Run `vc env pull` before a paid run.");
  }

  // Existing extractions on disk (idempotent).
  let existing = {};
  if (fs.existsSync(OUT_PATH)) {
    existing = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
    console.log(`Loaded ${Object.keys(existing).length} existing entries.`);
  }

  // Build the candidate list: published places with usable review text.
  const candidates = DFP.filter(
    (p) => p.is_operational !== "closed_permanently",
  )
    .map((p) => {
      const e = ENRICH[p.slug];
      return {
        slug: p.slug,
        name: p.name,
        score: p.feature_score || 0,
        editorial: e?.editorial_summary,
        review: e?.review_snippet,
      };
    })
    .filter(
      (c) =>
        (c.editorial && c.editorial.length > 20) ||
        (c.review && c.review.length > 60),
    )
    .sort((a, b) => b.score - a.score)
    .filter((c) => run.force || !existing[c.slug])
    .slice(0, run.limit);

  console.log(
    `${run.dryRun ? "Planning" : "Processing"} ${candidates.length} place(s) ` +
      `(hard ceiling: ${run.limit} model call(s)).`,
  );
  if (run.dryRun) {
    console.log("DRY RUN — no model calls and no files changed.");
    console.log("Use --live --confirm --limit N after reviewing this bounded plan.");
    return;
  }

  let done = 0;
  const out = { ...existing };

  // Process 5 at a time. AI Gateway handles rate limiting upstream.
  const CONCURRENCY = 5;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (c) => {
        const obj = await extractOne(c.name, c.editorial, c.review);
        return { slug: c.slug, name: c.name, obj };
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        const { slug, obj } = r.value;
        // Only persist if we got at least one useful field.
        if (obj.known_for.length > 0 || obj.customers_loved.length > 0) {
          out[slug] = {
            ...obj,
            source: "ai-gpt4o-mini",
            extracted_at: new Date().toISOString(),
          };
        }
        done++;
      } else {
        console.warn("  FAIL:", r.reason?.message || r.reason);
      }
    }
    // Persist incrementally so a crash doesn't lose progress.
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
    console.log(`  ${done}/${candidates.length} (last batch: ${batch.map((b) => b.name).join(", ")})`);
  }

  console.log(`\nDone. ${Object.keys(out).length} entries in ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
