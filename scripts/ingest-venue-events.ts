/**
 * Venue events extraction agent.
 *
 * Many Frederick venues only post their lineups on their own site — and
 * each in a different shape. This agent collects them by the cleanest
 * method available per venue (declared in config/venue-sources.json),
 * dedupes against what's known, and writes src/data/venue-events.json
 * with source + freshness — which the events feed + answer engine read.
 *
 * Collection methods, cleanest first:
 *   feed   — a structured Squarespace ?format=json events collection,
 *            parsed DETERMINISTICALLY (no model call): exact, free, stable.
 *   image  — the calendar is published only as a graphic; read with
 *            Claude vision from the venue's imageUrl.
 *   render — JS-rendered/403 page → headless browser → model extraction.
 *   fetch  — static HTML → model extraction.
 *
 * Run:  npm run ingest:venues            (all venues)
 *       npm run ingest:venues banyan     (one venue)
 * Needs: ANTHROPIC_API_KEY (feed-only venues don't, but the run preflights
 * once). Scheduled by .github/workflows/ingest-venues.yml.
 *
 * Social-only venues aren't scraped here (ToS/access) — see
 * docs/EXTRACTION_PLATFORM.md for the partnership/vision/human path.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchPageText,
  fetchSquarespaceEvents,
  extractJson,
  extractJsonFromImage,
  nowISO,
  preflightKey,
} from "./lib/extract-agent";

const OUT = resolve("src/data/venue-events.json");
const CONFIG = resolve("config/venue-sources.json");

type Method = "feed" | "image" | "render" | "fetch";
type VenueSource = {
  slug: string;
  name: string;
  category?: string;
  method?: Method;
  urls: string[];
  imageUrl?: string;
  // Legacy flag kept for back-compat: render:true == method "render".
  render?: boolean;
};
type RawEvent = {
  title?: string;
  starts_at?: string; // ISO or plain date/time as published
  ends_at?: string;
  description?: string;
  description_origin?: "source-excerpt" | "radius-summary";
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
  `"ends_at"?: string, "description"?: string (one complete, neutral sentence), "price"?: string, "ticket_url"?: string (absolute) }\n` +
  `Copy each published title exactly. A description must use only facts from the source and must not use fragments, ` +
  `slogans, promotional filler, or an invented three-part list. Preserve a factual list when the source requires it. ` +
  `Only include events clearly listed on the page with a real date. Skip past events. If none, return [].`;

const IMAGE_SHAPE =
  `This image is a venue's monthly events/music calendar. Extract every event legibly shown as a JSON array. Each item:\n` +
  `{ "title": string, "starts_at": string (date, with time if shown; include the year ${new Date().getFullYear()} if the image omits it), ` +
  `"description"?: string (one complete, neutral sentence using only legible facts) }\n` +
  `Copy each published title exactly. Do not use fragments, promotional filler, or an invented three-part list. ` +
  `Only events you can actually read in the image, with a real date. If none are legible, return [].`;

/** Resolve the collection method, honoring the legacy render flag. */
const methodOf = (v: VenueSource): Method => v.method ?? (v.render ? "render" : "fetch");

/** Stable key to dedupe an event across runs. */
const keyOf = (e: VenueEvent) => `${e.venue_slug}::${(e.title ?? "").toLowerCase().trim()}::${e.starts_at ?? ""}`;

/**
 * Collect raw events for one venue by its declared method. Returns the
 * events plus the source URL to stamp on each. Never throws: a failed
 * fetch/extract yields [] so the caller leaves prior data untouched.
 */
async function collect(venue: VenueSource): Promise<{ events: RawEvent[]; sourceUrl: string }> {
  const method = methodOf(venue);

  if (method === "image") {
    if (!venue.imageUrl) {
      console.log(`  – no imageUrl configured`);
      return { events: [], sourceUrl: venue.urls[0] ?? "" };
    }
    const events = await extractJsonFromImage<RawEvent[]>(
      `Venue: ${venue.name} (Frederick County, MD).\n${IMAGE_SHAPE}`,
      venue.imageUrl,
    );
    const n = Array.isArray(events) ? events.length : 0;
    console.log(`  ✓ ${n} event(s) from image ${venue.imageUrl}`);
    return {
      events: Array.isArray(events)
        ? events.map((event) => ({
            ...event,
            ...(event.description ? { description_origin: "radius-summary" as const } : {}),
          }))
        : [],
      sourceUrl: venue.urls[0] ?? venue.imageUrl,
    };
  }

  if (method === "feed") {
    // Deterministic Squarespace JSON — no model call. Try each URL until
    // one yields events.
    for (const url of venue.urls) {
      const events = await fetchSquarespaceEvents(url);
      if (events.length) {
        console.log(`  ✓ ${events.length} event(s) from feed ${url}`);
        return { events, sourceUrl: url };
      }
    }
    console.log(`  – feed returned no upcoming events`);
    return { events: [], sourceUrl: venue.urls[0] ?? "" };
  }

  // render | fetch — page text → model. Try each URL; first hit wins.
  for (const url of venue.urls) {
    const text = await fetchPageText(url, { render: method === "render" });
    if (!text) continue;
    const events = await extractJson<RawEvent[]>(
      `Venue: ${venue.name} (Frederick County, MD).\n${SHAPE}`,
      text,
    );
    if (Array.isArray(events) && events.length) {
      console.log(`  ✓ ${events.length} event(s) from ${url}`);
      return {
        events: events.map((event) => ({
          ...event,
          ...(event.description ? { description_origin: "radius-summary" as const } : {}),
        })),
        sourceUrl: url,
      };
    }
    console.log(`  – 0 event(s) from ${url}`);
  }
  return { events: [], sourceUrl: venue.urls[0] ?? "" };
}

async function main() {
  // The key gates only the MODEL-ASSISTED methods (render/fetch/image). The
  // deterministic Squarespace `feed` venues need no model, so a keyless run
  // still refreshes them instead of bailing entirely — that global bail is
  // how the whole snapshot silently expired (data audit P0-1: 25/25 events
  // stale) when no key was around to re-run it.
  const hasKey = await preflightKey();
  const only = process.argv[2];
  const cfg = JSON.parse(readFileSync(CONFIG, "utf8")) as { venues: VenueSource[] };
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as VenueEvent[];
  const byKey = new Map(existing.map((e) => [keyOf(e), e]));
  const venues = cfg.venues.filter((v) => (only ? v.slug === only : true));

  let added = 0;
  for (const venue of venues) {
    const hasSource = venue.urls?.length || venue.imageUrl;
    if (!hasSource) {
      console.log(`• ${venue.name}: no source configured — skipped`);
      continue;
    }
    if (!hasKey && methodOf(venue) !== "feed") {
      console.log(`• ${venue.name} [${methodOf(venue)}]: needs ANTHROPIC_API_KEY — skipped (prior data untouched)`);
      continue;
    }
    console.log(`• ${venue.name} [${methodOf(venue)}]`);
    const { events, sourceUrl } = await collect(venue);
    for (const ev of events) {
      if (!ev.title || !ev.starts_at) continue;
      const full: VenueEvent = {
        ...ev,
        venue_slug: venue.slug,
        venue_name: venue.name,
        category: venue.category,
        source: { url: sourceUrl, fetchedAt: nowISO() },
      };
      const k = keyOf(full);
      if (!byKey.has(k)) added++;
      byKey.set(k, full); // refresh freshness even if known
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
