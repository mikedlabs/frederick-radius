/**
 * Business deep-info extraction agent.
 *
 * The buried-info moat at scale. Where the civic/venue agents read a
 * hand-listed set of URLs, this one reads the website each place ALREADY
 * has on file (src/data/places-enrichment.json — 2,887 of them) and
 * pulls the things Google doesn't surface: what a place is known for,
 * its happy hour, recurring specials, published hours, reservations.
 *
 * Focused on food/drink by default (where this info matters and exists),
 * filtered to own-domain business sites (not gov/aggregator/social).
 * Adaptive fetch: tries a plain request first (most small-business sites
 * are readable), falls back to a headless render only when the static
 * HTML comes back too thin (JS-rendered). Incremental: skips anything
 * fetched within `refreshDays` unless --force.
 *
 * Run:  npm run ingest:business                 (a batch, up to defaultLimit)
 *       npm run ingest:business -- --limit=200   (bigger batch)
 *       npm run ingest:business ayse-meze-frederick   (one place, by slug)
 *       npm run ingest:business -- --force        (re-fetch even fresh ones)
 * Needs: ANTHROPIC_API_KEY. Scheduled by .github/workflows/ingest-business-info.yml.
 *
 * Never fabricates — the shared extractor omits anything not on the page.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchPageText, extractJson, nowISO } from "./lib/extract-agent";

const OUT = resolve("src/data/business-info.json");
const ENR = resolve("src/data/places-enrichment.json");
const CFG = resolve("config/business-info.json");

type Enrichment = Record<
  string,
  { website?: string; primary_type?: string; display_name?: string }
>;
type Cfg = {
  typeIncludes: string[];
  excludeDomains: string[];
  refreshDays: number;
  defaultLimit: number;
  renderFallbackMinChars: number;
};
type Info = {
  known_for?: string;
  happy_hour?: string;
  specials?: string[];
  hours_text?: string;
  reservations_url?: string;
  notable?: string;
};
type Record_ = Info & { name?: string; source: { url: string; fetchedAt: string } };

const SHAPE =
  `Extract these from this local business's own website. Include ONLY facts ` +
  `clearly stated on the page — omit any field that isn't. Return JSON:\n` +
  `{\n` +
  `  "known_for": string — ONE sentence: the 1–3 things this place is known for (signature dishes/drinks/vibe),\n` +
  `  "happy_hour": string — days + times + what's discounted, verbatim where possible (e.g. "Mon–Fri 4–6pm: $5 drafts, $7 wells"),\n` +
  `  "specials": string[] — recurring weekly specials (e.g. "Taco Tuesday", "half-price bottles Wednesday"),\n` +
  `  "hours_text": string — operating hours as published,\n` +
  `  "reservations_url": string — absolute URL for online reservations if present,\n` +
  `  "notable": string — one more useful detail (patio, dog-friendly, live-music nights, parking)\n` +
  `}\n` +
  `Never invent prices, times, or dishes. If nothing applies, return {}.`;

function domainOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Plain fetch first (fast, works for most small-business sites); fall
 *  back to a headless render only when the static HTML is too thin. */
async function fetchAdaptive(url: string, minChars: number): Promise<string | null> {
  const plain = await fetchPageText(url, { maxChars: 16_000 });
  if (plain && plain.length >= minChars) return plain;
  const rendered = await fetchPageText(url, { render: true, maxChars: 16_000 });
  return rendered ?? plain;
}

async function main() {
  const positional = process.argv[2];
  const only = positional && !positional.startsWith("--") ? positional : undefined;
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const force = process.argv.includes("--force");

  const cfg = JSON.parse(readFileSync(CFG, "utf8")) as Cfg;
  const enr = JSON.parse(readFileSync(ENR, "utf8")) as Enrichment;
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, Record_>;
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : cfg.defaultLimit;

  const eligible = Object.entries(enr).filter(([slug, r]) => {
    if (only) return slug === only;
    if (!r.website || !/^https?:/.test(r.website)) return false;
    const d = domainOf(r.website);
    if (!d || cfg.excludeDomains.some((x) => d.includes(x))) return false;
    return cfg.typeIncludes.some((t) => (r.primary_type ?? "").includes(t));
  });

  const cutoff = Date.now() - cfg.refreshDays * 86_400_000;
  const todo = eligible
    .filter(([slug]) => {
      if (force || only) return true;
      const e = existing[slug];
      return !e || !e.source?.fetchedAt || Date.parse(e.source.fetchedAt) < cutoff;
    })
    .slice(0, limit);

  console.log(
    `${eligible.length} eligible food/drink businesses; ${todo.length} to read this run (limit ${limit}).`,
  );

  let updated = 0;
  for (const [slug, r] of todo) {
    const text = await fetchAdaptive(r.website!, cfg.renderFallbackMinChars);
    if (!text) {
      console.log(`  ✗ ${slug}: unreadable (${domainOf(r.website!)})`);
      continue;
    }
    const info = await extractJson<Info>(
      `Business: ${r.display_name ?? slug} (Frederick County, MD).\n${SHAPE}`,
      text,
    );
    if (!info || typeof info !== "object") continue;
    const has =
      info.known_for ||
      info.happy_hour ||
      (info.specials && info.specials.length) ||
      info.hours_text ||
      info.notable;
    if (!has) {
      console.log(`  – ${slug}: nothing extractable`);
      continue;
    }
    existing[slug] = {
      ...info,
      name: r.display_name,
      source: { url: r.website!, fetchedAt: nowISO() },
    };
    updated++;
    const tags = [
      info.happy_hour ? "happy-hour" : null,
      info.known_for ? "known-for" : null,
      info.specials?.length ? "specials" : null,
    ]
      .filter(Boolean)
      .join(" ");
    console.log(`  ✓ ${slug}${tags ? ` [${tags}]` : ""}`);
  }

  writeFileSync(OUT, JSON.stringify(existing, null, 2) + "\n");
  console.log(
    `\nDone. ${updated} updated, ${Object.keys(existing).length} total → src/data/business-info.json`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
