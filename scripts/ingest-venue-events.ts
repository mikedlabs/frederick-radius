/**
 * Venue events extraction agent.
 *
 * Many Frederick venues (The Banyan, The Derby, Sky Stage…) only post
 * their lineups on their own site or socials — buried, no feed. This
 * agent closes that gap using the shared extraction engine: for each
 * venue in config/venue-sources.json with URL(s), it fetches the events
 * page, has Claude pull upcoming events as strict JSON (never guessing),
 * dedupes against what's known, and writes src/data/venue-events.json
 * with source + freshness — which the events feed + answer engine read.
 *
 * Run:  npm run ingest:venues            (all venues with URLs)
 *       npm run ingest:venues banyan     (one venue)
 * Needs: ANTHROPIC_API_KEY. Scheduled by .github/workflows/ingest-venues.yml.
 *
 * Social-only venues aren't scraped here (ToS/access) — see
 * docs/EXTRACTION_PLATFORM.md for the partnership/vision/human path.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchPageText, extractJson, nowISO, preflightKey } from "./lib/extract-agent";

const OUT = resolve("src/data/venue-events.json");
const CONFIG = resolve("config/venue-sources.json");

type VenueSource = { slug: string; name: string; category?: string; urls: string[]; render?: boolean };
type RawEvent = {
  title?: string;
  starts_at?: string; // ISO or plain date/time as published
  ends_at?: string;
  description?: string;
  price?: string;
  ticket_url?: string;
};
type VenueEvent = RawEvent & {
  venue_slug: string;
  venue_name: string;
  category?: string;
  source: { url: string; fetchedAt: string };
};

const SHAPE =
  `Extract UPCOMING events from this venue's page as a JSON array. Each item:\n` +
  `{ "title": string, "starts_at": string (date and time as published, ISO if possible), ` +
  `"ends_at"?: string, "description"?: string (one sentence), "price"?: string, "ticket_url"?: string (absolute) }\n` +
  `Only events clearly listed on the page with a real date. Skip past events. If none, return [].`;

/** Stable key to dedupe an event across runs. */
const keyOf = (e: VenueEvent) => `${e.venue_slug}::${(e.title ?? "").toLowerCase().trim()}::${e.starts_at ?? ""}`;

async function main() {
  if (!(await preflightKey())) return;
  const only = process.argv[2];
  const cfg = JSON.parse(readFileSync(CONFIG, "utf8")) as { venues: VenueSource[] };
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as VenueEvent[];
  const byKey = new Map(existing.map((e) => [keyOf(e), e]));
  const venues = cfg.venues.filter((v) => (only ? v.slug === only : true));

  let added = 0;
  for (const venue of venues) {
    if (!venue.urls?.length) {
      console.log(`• ${venue.name}: no URLs configured — skipped`);
      continue;
    }
    console.log(`• ${venue.name}: ${venue.urls.length} url(s)`);
    for (const url of venue.urls) {
      const text = await fetchPageText(url, { render: venue.render });
      if (!text) continue;
      const events = await extractJson<RawEvent[]>(
        `Venue: ${venue.name} (Frederick County, MD).\n${SHAPE}`,
        text,
      );
      if (!Array.isArray(events)) continue;
      for (const ev of events) {
        if (!ev.title || !ev.starts_at) continue;
        const full: VenueEvent = {
          ...ev,
          venue_slug: venue.slug,
          venue_name: venue.name,
          category: venue.category,
          source: { url, fetchedAt: nowISO() },
        };
        const k = keyOf(full);
        if (!byKey.has(k)) added++;
        byKey.set(k, full); // refresh freshness even if known
      }
      console.log(`  ✓ ${events.length} event(s) from ${url}`);
    }
  }

  // Keep only future-ish events: drop anything whose date clearly parsed in the past.
  const now = Date.now();
  const kept = [...byKey.values()].filter((e) => {
    const t = Date.parse(e.starts_at ?? "");
    return !Number.isFinite(t) || t >= now - 86_400_000; // keep unparseable + within last day
  });

  writeFileSync(OUT, JSON.stringify(kept, null, 2) + "\n");
  console.log(`\nDone. +${added} new, ${kept.length} total → src/data/venue-events.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
