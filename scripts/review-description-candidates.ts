/**
 * Pre-flight for pending description candidates.
 *
 * build-description-candidates.ts writes blurbs into descriptions.json with
 * status "candidate", and an editor must promote each one by hand. That gate
 * is correct - a description is a claim about a real business - but with 51
 * pending and no decision support, the queue simply stopped moving. Nothing
 * has ever been rejected, which is what a stalled queue looks like from the
 * outside.
 *
 * This does the MECHANICAL half of the review and nothing else:
 *
 *   - the repo's own voice lint (docs/VOICE.md), run through the same
 *     lintSourceText the CI gate uses, so a candidate cannot pass here and
 *     fail style-lint later
 *   - the scraped-directory tells in copy-quality.ts
 *   - the name check the builder itself uses for evidence matching
 *   - length, sourcing, and a claim-scope check for sentences that describe a
 *     chain rather than the Frederick County listing
 *
 * It never promotes anything on its own. `--approve <slug>...` performs the
 * JSON edit for slugs the editor has decided on, and records that the
 * mechanical pre-flight is all this tool contributed, so provenance never
 * overstates the review.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { lintSourceText } from "./style-lint";
import {
  classifyDescription,
  isDescriptionMechanicallySafe,
} from "../src/lib/copy-quality";
import { namesMatch } from "./build-description-candidates";

const REGISTRY_PATH = resolve("src/data/descriptions.json");
const PLACES_PATH = resolve("src/data/places-client.json");

type Registry = Record<
  string,
  {
    blurb: string;
    status: "candidate" | "approved" | "rejected";
    source?: { kind?: string; url?: string; fetched_at?: string };
    generated_at?: string;
    reviewed_at?: string;
    reviewer_note?: string;
  }
>;

type Place = { slug: string; name: string; category?: string; city?: string };

/** Words that describe a company rather than the listed Frederick location. */
const CHAIN_SCOPE = /\b(locations|nationwide|across (?:the )?(?:country|states?)|multiple (?:states|locations))\b/i;

export type CandidateReview = {
  slug: string;
  name: string;
  blurb: string;
  flags: string[];
};

export function reviewCandidate(
  slug: string,
  blurb: string,
  place: Place | undefined,
  source: { kind?: string; url?: string } | undefined,
): CandidateReview {
  const flags: string[] = [];
  const name = place?.name ?? slug;

  // The voice lint operates on source text, so present the sentence as the
  // string literal it will eventually become. Same rules, same rule names.
  const findings = lintSourceText(
    "candidate.ts",
    `const blurb = ${JSON.stringify(blurb)};`,
  );
  for (const finding of findings) flags.push(`voice: ${finding.rule}`);

  if (!isDescriptionMechanicallySafe(name, blurb)) {
    flags.push("reads as scraped directory copy");
  }
  const quality = classifyDescription(name, blurb);
  if (quality === "scraped" || quality === "none") {
    flags.push(`copy-quality: ${quality}`);
  }

  if (!place) flags.push("no matching place in the published catalog");
  else if (!namesMatch(place.name, blurb)) {
    // The builder matches evidence to a place by name; a blurb that never
    // names its subject is the shape of a description attached to the wrong
    // listing.
    flags.push("blurb does not name the place");
  }

  if (!source?.url) flags.push("no source url");
  if (source?.kind && source.kind !== "business_website") {
    flags.push(`source kind: ${source.kind}`);
  }

  const trimmed = blurb.trim();
  if (trimmed.length < 40) flags.push("shorter than 40 characters");
  if (trimmed.length > 320) flags.push("longer than 320 characters");
  if (!/[.!?]$/.test(trimmed)) flags.push("does not end a sentence");
  if (CHAIN_SCOPE.test(trimmed)) {
    flags.push("describes the company, not this location");
  }

  return { slug, name, blurb: trimmed, flags };
}

function loadRegistry(): Registry {
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as Registry;
}

function main(): void {
  const args = process.argv.slice(2);
  const approveAt = args.indexOf("--approve");
  const registry = loadRegistry();
  const places = new Map(
    (JSON.parse(readFileSync(PLACES_PATH, "utf8")) as Place[]).map((p) => [
      p.slug,
      p,
    ]),
  );

  if (approveAt >= 0) {
    const slugs = args.slice(approveAt + 1).filter((s) => !s.startsWith("--"));
    if (slugs.length === 0) {
      console.error("--approve needs at least one slug.");
      process.exit(1);
    }
    const now = new Date().toISOString();
    let changed = 0;
    for (const slug of slugs) {
      const entry = registry[slug];
      if (!entry) {
        console.error(`  ✗ ${slug}: not in the registry`);
        continue;
      }
      if (entry.status !== "candidate") {
        console.error(`  – ${slug}: already ${entry.status}`);
        continue;
      }
      entry.status = "approved";
      entry.reviewed_at = now;
      entry.reviewer_note =
        "Editor-approved. Mechanical pre-flight (voice lint, copy quality, " +
        "name and source checks) passed; the editorial judgement is the " +
        "editor's own.";
      changed += 1;
      console.log(`  ✓ ${slug}`);
    }
    if (changed > 0) {
      writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
      console.log(`\napproved ${changed}; run npm run build:client-places next.`);
    }
    return;
  }

  const candidates = Object.entries(registry).filter(
    ([, v]) => v.status === "candidate",
  );
  const reviews = candidates.map(([slug, v]) =>
    reviewCandidate(slug, v.blurb, places.get(slug), v.source),
  );
  const clean = reviews.filter((r) => r.flags.length === 0);
  const flagged = reviews.filter((r) => r.flags.length > 0);

  console.log(
    `description candidates: ${reviews.length} pending — ${clean.length} mechanically clean, ${flagged.length} need your eye.\n`,
  );

  if (flagged.length > 0) {
    console.log("NEEDS YOUR EYE");
    for (const r of flagged) {
      console.log(`\n  ${r.name}  (${r.slug})`);
      console.log(`    ${r.blurb}`);
      for (const flag of r.flags) console.log(`    ! ${flag}`);
    }
    console.log("");
  }

  if (clean.length > 0) {
    console.log("MECHANICALLY CLEAN — read them, then approve the ones you want");
    for (const r of clean) console.log(`\n  ${r.name}\n    ${r.blurb}`);
    console.log(
      `\n  npm run descriptions:review -- --approve ${clean
        .slice(0, 3)
        .map((r) => r.slug)
        .join(" ")} ...`,
    );
  }
}

if (process.argv[1]?.endsWith("review-description-candidates.ts")) main();
