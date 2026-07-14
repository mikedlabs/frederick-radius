/**
 * detect-closures.ts — FREE closure detector using the AnySearch web API.
 *
 * Why: a local guide loses trust the moment it lists a place that has closed
 * (see the Idiom Brewing example). The paid path (refresh:business-status)
 * costs a Google Place Details call per place; this is the free complement —
 * a web search per place that reads the open web (the business's own site,
 * the Frederick News-Post, MoCo Show, etc.) for closure language and produces
 * a REVIEW-READY candidate list. It maps straight onto KNOWN_CLOSED_CANONICAL
 * in src/lib/integrations/closures.ts (name + source URL + date + quote).
 *
 * DRY RUN BY DESIGN. This script NEVER writes to places, overrides, or the
 * closures denylist. It writes only a candidate report you skim; you then
 * add confirmed closures to KNOWN_CLOSED_CANONICAL by hand. Human corrections
 * win — that is the pipeline rule (CLAUDE.md).
 *
 * Budget: the AnySearch free tier is ~1000 calls. The curated catalog
 * (src/data/places.ts, ~100 places, minus ones already flagged closed) fits
 * comfortably in one sweep. The DFP long-tail is intentionally NOT swept by
 * default — it alone would exceed the free budget. Run this quarterly.
 *
 * Setup: put your key in .env.local (gitignored):
 *   ANYSEARCH_API_KEY=as_sk_...
 *
 * Usage:
 *   npm run closures:detect                 # sweep the curated catalog
 *   npm run closures:detect -- --limit 5    # cheap smoke test (5 calls)
 *   npm run closures:detect -- --slug idiom-brewing-frederick
 *   npm run closures:detect -- --min medium # only medium+ confidence in report
 *
 * Output: scripts/reports/closure-candidates.json (gitignored) + a console
 * summary sorted by confidence.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES } from "@/data/places";
import { isKnownClosed } from "@/lib/integrations/closures";

const ENDPOINT = "https://api.anysearch.com/mcp";
const KEY = process.env.ANYSEARCH_API_KEY;

// ── CLI args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const onlySlug = flag("slug");
const limit = flag("limit") ? Math.max(1, parseInt(flag("limit") as string, 10)) : undefined;
const minConf = (flag("min") as "low" | "medium" | "high" | undefined) ?? "low";
const CONF_RANK = { low: 0, medium: 1, high: 2 } as const;

// ── Closure language ────────────────────────────────────────────────────────
// HIGH: phrasing that only appears when a business has actually closed.
const HIGH: RegExp[] = [
  /permanently closed/i,
  /closed permanently/i,
  /closed (its|their) doors/i,
  /closed for good/i,
  /out of business/i,
  /ceased operations/i,
  /no longer (in business|open|operating)/i,
  /final day of (operation|business)/i,
  /has shut down/i,
  /shuttered/i,
];
// SOFT: suggestive but also appears in benign contexts, so it only counts as
// corroboration, never on its own.
const SOFT: RegExp[] = [
  /(has|have|is now) closed/i,
  /will (permanently )?close/i,
  /to close (on|in)/i,
  /closing (its|their) doors/i,
];
// TEMPORARY: worth surfacing, but a different status (closed_temporarily).
const TEMP: RegExp[] = [/temporarily closed/i, /closed for (renovation|repairs)/i];
// Hours-context "closed" that must NOT be read as a closure signal.
const HOURS_FALSE: RegExp =
  /closed (on )?(mon|tue|wed|thu|fri|sat|sun|today|now)\b|closed at \d|closed for (lunch|the day|the holiday|the season|the night)/gi;

type Hit = { host: string; url: string; phrase: string; snippet: string; strength: "high" | "soft" | "temp" };
type Candidate = {
  slug: string;
  name: string;
  town: string;
  status: "closed_permanently" | "closed_temporarily";
  confidence: "low" | "medium" | "high";
  ownSiteConfirms: boolean;
  hits: Hit[];
};

function host(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function titleCase(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function snippetAround(text: string, re: RegExp): string {
  const m = text.match(re);
  if (!m || m.index == null) return "";
  const start = Math.max(0, m.index - 90);
  const end = Math.min(text.length, m.index + m[0].length + 90);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

// AnySearch returns one markdown blob: "### N. Title\n- **URL**: x\n- <content>".
function parseResults(text: string): Array<{ title: string; url: string; content: string }> {
  const out: Array<{ title: string; url: string; content: string }> = [];
  for (const block of text.split(/\n(?=###\s*\d+\.)/)) {
    const urlM = block.match(/- \*\*URL\*\*:\s*(\S+)/);
    if (!urlM) continue;
    const titleM = block.match(/^###\s*\d+\.\s*(.+)/m);
    const after = block.slice(block.indexOf(urlM[0]) + urlM[0].length);
    const content = after.replace(/^\s*-?\s*/, "").trim();
    out.push({ title: titleM?.[1]?.trim() ?? "", url: urlM[1], content });
  }
  return out;
}

async function anysearch(query: string, tries = 3): Promise<string> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "search", arguments: { query, max_results: 3 } },
      }),
    });
    if (res.status === 429) {
      const wait = 2000 * attempt;
      console.warn(`  rate limited, backing off ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      error?: { message: string };
      result?: { content?: Array<{ text?: string }> };
    };
    if (data.error) throw new Error(`AnySearch: ${data.error.message}`);
    return data.result?.content?.[0]?.text ?? "";
  }
  throw new Error("rate limited after retries");
}

function evaluate(
  place: { slug: string; name: string; town: string; siteHost: string },
  results: Array<{ url: string; content: string }>,
): Candidate | null {
  const hits: Hit[] = [];
  let ownSiteConfirms = false;
  let permanentHostCount = 0;
  const seenHosts = new Set<string>();

  for (const r of results) {
    const h = host(r.url);
    // Blank out hours-context "closed X" so it can't be mistaken for closure.
    const clean = r.content.replace(HOURS_FALSE, " ");
    const onOwnSite = !!place.siteHost && h === place.siteHost;

    let hostContributedPermanent = false;
    for (const re of HIGH) {
      if (re.test(clean)) {
        hits.push({ host: h, url: r.url, phrase: re.source, snippet: snippetAround(clean, re), strength: "high" });
        hostContributedPermanent = true;
        if (onOwnSite) ownSiteConfirms = true;
      }
    }
    for (const re of SOFT) {
      if (re.test(clean)) {
        hits.push({ host: h, url: r.url, phrase: re.source, snippet: snippetAround(clean, re), strength: "soft" });
        if (onOwnSite) hostContributedPermanent = true; // own site saying "is now closed" is strong
      }
    }
    for (const re of TEMP) {
      if (re.test(clean)) {
        hits.push({ host: h, url: r.url, phrase: re.source, snippet: snippetAround(clean, re), strength: "temp" });
      }
    }
    if (hostContributedPermanent && !seenHosts.has(h)) {
      seenHosts.add(h);
      permanentHostCount++;
    }
  }

  const hasHigh = hits.some((x) => x.strength === "high");
  const hasSoft = hits.some((x) => x.strength === "soft");
  const hasTemp = hits.some((x) => x.strength === "temp");

  // No permanent-closure evidence at all → temporary if flagged, else not a candidate.
  if (!hasHigh && !hasSoft) {
    if (hasTemp) {
      return {
        slug: place.slug,
        name: place.name,
        town: place.town,
        status: "closed_temporarily",
        confidence: "low",
        ownSiteConfirms: false,
        hits: hits.slice(0, 4),
      };
    }
    return null;
  }

  // Confidence: own-site confirmation or two independent sources → high.
  let confidence: Candidate["confidence"];
  if (ownSiteConfirms || permanentHostCount >= 2) confidence = "high";
  else if (hasHigh) confidence = "medium";
  else confidence = "low"; // soft-only, single source

  return {
    slug: place.slug,
    name: place.name,
    town: place.town,
    status: "closed_permanently",
    confidence,
    ownSiteConfirms,
    hits: hits.slice(0, 5),
  };
}

async function main() {
  if (!KEY) {
    console.error("ANYSEARCH_API_KEY is not set. Add it to .env.local:\n  ANYSEARCH_API_KEY=as_sk_...");
    process.exit(1);
  }

  // Targets: curated places not already known-closed.
  let targets = PLACES.filter((p) => {
    if (p.is_operational === "closed_permanently" || p.is_operational === "closed_temporarily") return false;
    if (isKnownClosed(p.name)) return false;
    return true;
  }).map((p) => ({
    slug: p.slug,
    name: p.name,
    town: titleCase(p.municipality),
    siteHost: p.website ? host(p.website) : "",
  }));

  if (onlySlug) targets = targets.filter((t) => t.slug === onlySlug);
  if (limit) targets = targets.slice(0, limit);

  if (targets.length === 0) {
    console.log("No targets (check --slug, or everything is already flagged closed).");
    return;
  }

  console.log(
    `Checking ${targets.length} place(s) via AnySearch (~1 call each; free tier ~1000).` +
      ` Est. ${Math.ceil((targets.length * 2.2) / 60)} min.\n`,
  );

  const candidates: Candidate[] = [];
  let calls = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const query = `${t.name} ${t.town} Frederick County MD hours closed`;
    process.stdout.write(`[${i + 1}/${targets.length}] ${t.name} … `);
    try {
      const text = await anysearch(query);
      calls++;
      const cand = evaluate(t, parseResults(text));
      if (cand) {
        candidates.push(cand);
        console.log(`⚑ ${cand.status.replace("closed_", "")} (${cand.confidence})`);
      } else {
        console.log("ok");
      }
    } catch (e) {
      console.log(`error: ${(e as Error).message}`);
      if ((e as Error).message.includes("rate limited")) {
        console.warn("Stopping early to preserve budget. Partial report saved.");
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 250)); // be gentle
  }

  const rank = CONF_RANK[minConf] ?? 0;
  const report = candidates
    .filter((c) => CONF_RANK[c.confidence] >= rank)
    .sort((a, b) => CONF_RANK[b.confidence] - CONF_RANK[a.confidence]);

  const out = {
    generated_at: new Date().toISOString(),
    api_calls: calls,
    checked: targets.length,
    candidate_count: report.length,
    note: "DRY RUN. Review each candidate, then add confirmed closures to KNOWN_CLOSED_CANONICAL in src/lib/integrations/closures.ts.",
    candidates: report,
  };
  const dir = resolve("scripts/reports");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "closure-candidates.json");
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");

  console.log(`\n─────────────────────────────────────────────`);
  console.log(`AnySearch calls used: ${calls}  (free tier ~1000)`);
  console.log(`Candidates (${minConf}+): ${report.length} of ${targets.length} checked\n`);
  for (const c of report) {
    const badge = c.status === "closed_permanently" ? "CLOSED" : "TEMP  ";
    console.log(`  ${badge} [${c.confidence.padEnd(6)}] ${c.name} — ${c.town}${c.ownSiteConfirms ? " (own site confirms)" : ""}`);
    const ev = c.hits[0];
    if (ev) console.log(`         ${ev.host}: "${ev.snippet.slice(0, 100)}${ev.snippet.length > 100 ? "…" : ""}"`);
  }
  console.log(`\nFull report: ${path}`);
  console.log(`Next: verify each, then add confirmed ones to KNOWN_CLOSED_CANONICAL (src/lib/integrations/closures.ts).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
