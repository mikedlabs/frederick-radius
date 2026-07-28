/**
 * Runtime Squarespace events fetcher — pulls a venue's live-music lineup
 * straight from its Squarespace events page WITHOUT a database, a cron, or a
 * committed snapshot. Squarespace exposes every events collection as clean
 * structured JSON at `<page>?format=json`, with an `upcoming` array of
 * concrete dated shows (epoch-ms `startDate`/`endDate`). Because the shows are
 * already dated (not RRULE-recurring like the venue iCal exports the
 * ical-live parser had to reject), they ingest perfectly at request time and
 * stay fresh on their own under the same hourly ISR cache the iCal/RSS feeds
 * use.
 *
 * Read side: assembleUnifiedEvents folds these into the one unified event set
 * via the shared venueEventToCard adapter (place-resolved geo + photo), so a
 * band at The Banyan tonight reads as an event on /today, /events, and /map.
 *
 * Source of truth for which venues this targets: the `squarespace` field in
 * src/data/live-music-venues.ts (LIVE_MUSIC_SQUARESPACE_VENUES). Fail-soft per
 * venue: a hung or malformed page degrades to [] and never blocks the render.
 */

import { LIVE_MUSIC_SQUARESPACE_VENUES } from "@/data/live-music-venues";
import { inferredNonMusicCategory } from "@/lib/events/live-music";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { cleanFeedText } from "@/lib/format/text";
import { clampDescription } from "@/lib/events/normalize";
import type { VenueEvent } from "@/lib/loaders/venueEvents";
import {
  eventAdapterDisabled,
  eventAdapterFailed,
  eventAdapterOk,
  type EventAdapterResult,
} from "@/lib/integrations/event-adapter-result";

// Same ceiling as the iCal feeds — the unified assembly awaits all sources in
// parallel, so one slow page must not hold the page hostage.
const FETCH_TIMEOUT_MS = 8_000;

/** One item in a Squarespace events-collection `?format=json` payload.
 *  Only the fields we read are typed; the payload carries far more. */
type SquarespaceItem = {
  title?: string;
  startDate?: number;
  endDate?: number;
  fullUrl?: string;
  excerpt?: string;
  body?: string;
};

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Squarespace event bodies routinely embed raw block CSS + HTML (style
 *  rules, `#block-…` selectors, `--tweak-*` custom properties, affiliate
 *  ticket URLs) that plain tag-stripping leaves behind as garbage prose. So:
 *  prefer the curated `excerpt`, and only fall back to `body` if it still
 *  reads as clean prose AFTER stripping style/script blocks, tags, CSS rule
 *  blocks, leftover custom props, and bare URLs. For a live-music show the
 *  title + venue + time already carry the meaning, so "" is a fine result. */
function descriptionFrom(item: SquarespaceItem): string {
  const excerpt = (item.excerpt ?? "").trim();
  if (excerpt) return clampDescription(cleanFeedText(excerpt.replace(/<[^>]+>/g, " ")), 300);
  const body = item.body ?? "";
  if (!body) return "";
  const stripped = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#.][\w-]+\s*\{[^}]*\}/g, " ") // CSS selector + rule block
    .replace(/\{[^}]*\}/g, " ") // any leftover bare rule block
    .replace(/--[\w-]+\s*:[^;]+;?/g, " ") // stray CSS custom properties
    .replace(/https?:\/\/\S+/g, " ") // raw URLs — ticket_url carries the link
    .replace(/\s+/g, " ")
    .trim();
  // Reject anything that still smells of markup or is too short to be prose.
  if (stripped.length < 12 || /[{}<>]|sqs-|tweak-|block-/i.test(stripped)) return "";
  return clampDescription(cleanFeedText(stripped), 300);
}

async function fetchVenue(
  venue: { slug: string; squarespace: string },
  now: Date,
  horizon: Date,
): Promise<EventAdapterResult<VenueEvent>> {
  const fetchedAt = now.toISOString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const sep = venue.squarespace.includes("?") ? "&" : "?";
  const feedUrl = `${venue.squarespace}${sep}format=json`;
  // The venue's canonical name comes from its place record so the card reads
  // "The Banyan" (matching the directory), not the Squarespace address title.
  const place = clientPlaceBySlug(venue.slug);
  const venueName = place?.name ?? venue.slug;
  const origin = originOf(venue.squarespace);
  try {
    const res = await fetch(feedUrl, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
        Accept: "application/json, text/javascript",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 410) {
        console.info(`[squarespace-live] ${venue.slug}: page retired (HTTP ${res.status})`);
      } else {
        console.warn(
`[squarespace-live] ${venue.slug}: HTTP ${res.status}`);
      }
      return eventAdapterFailed();
    }
    // Squarespace events collections expose future shows in `upcoming`; some
    // (e.g. Rockwell Brewery) only populate the generic `items` array. Prefer
    // `upcoming`, fall back to `items` — the date guard below filters either to
    // the real upcoming window, so a stale/past item never leaks.
    const data = (await res.json()) as { upcoming?: SquarespaceItem[]; items?: SquarespaceItem[] };
    const items = Array.isArray(data.upcoming) && data.upcoming.length
      ? data.upcoming
      : Array.isArray(data.items)
        ? data.items
        : [];
    const out: VenueEvent[] = [];
    for (const item of items) {
      const title = (item.title ?? "").trim();
      const startMs = item.startDate;
      if (!title || typeof startMs !== "number" || !Number.isFinite(startMs)) continue;
      const start = new Date(startMs);
      // Past-window guard mirrors upcomingVenueEvents (keep the last hour so a
      // show that just started still shows), and clamp to the same horizon the
      // iCal feeds honor so a date far out never leaks in.
      if (start.getTime() < now.getTime() - 3_600_000 || start > horizon) continue;
      const end =
        typeof item.endDate === "number" && Number.isFinite(item.endDate) && item.endDate > startMs
          ? new Date(item.endDate)
          : undefined;
      const eventUrl = item.fullUrl && origin ? `${origin}${item.fullUrl}` : venue.squarespace;
      const description = descriptionFrom(item);
      out.push({
        title,
        starts_at: start.toISOString(),
        ends_at: end?.toISOString(),
        description,
        ...(description ? { description_origin: "source-excerpt" as const } : {}),
        ticket_url: eventUrl,
        venue_slug: venue.slug,
        venue_name: venueName,
        // These are LIVE-MUSIC venue calendars, but taprooms put yoga,
        // trivia, and paint nights on the same feed as their bands — a
        // blanket "music" stamp put "Yoga in the Taproom" under "Live
        // music tonight" (Jul-8 audit). A clearly non-music title gets
        // no category here and falls back to the venue's own category
        // downstream (venueEventToCard).
        category: inferredNonMusicCategory(title) ?? "music",
        source: { url: venue.squarespace, fetchedAt },
      });
    }
    console.log(`[squarespace-live] ${venue.slug}: parsed ${out.length} upcoming shows`);
    return eventAdapterOk(out);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    // Expected fail-soft: an unreliable upstream feed timed out / refused, we
    // return [] and degrade gracefully — a WARNING, not an error, so recurring
    // feed flakiness doesn't drown real errors in the dashboard (mirrors the
    // ical-live precedent; 2026-07-12 audit P2.15).
    console.warn(
      `[squarespace-live] ${venue.slug} ${aborted ? `timed out (>${FETCH_TIMEOUT_MS}ms)` : "failed"}:`,
      err instanceof Error ? err.message : err,
    );
    return eventAdapterFailed();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch every Squarespace-published live-music lineup in parallel, returning a
 * flat set of VenueEvents within the window. Fail-soft: an individual venue
 * that errors contributes []. Inert (returns []) when no venue carries a
 * `squarespace` URL, so this path costs nothing until one is configured.
 */
export async function fetchSquarespaceVenueEventsResult(
  windowDays = 60,
): Promise<EventAdapterResult<VenueEvent>> {
  if (LIVE_MUSIC_SQUARESPACE_VENUES.length === 0) {
    return eventAdapterDisabled();
  }
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + windowDays);
  const results = await Promise.all(
    LIVE_MUSIC_SQUARESPACE_VENUES.map((v) =>
      fetchVenue({ slug: v.slug, squarespace: v.squarespace }, now, horizon),
    ),
  );
  const events = results.flatMap((result) => result.items);
  return results.some(
    (result) => result.state === "failed" || result.state === "partial",
  )
    ? eventAdapterFailed(events)
    : eventAdapterOk(events);
}

/** Legacy data-only facade. Health-aware callers should use the Result form. */
export async function fetchSquarespaceVenueEvents(
  windowDays = 60,
): Promise<VenueEvent[]> {
  return (await fetchSquarespaceVenueEventsResult(windowDays)).items;
}
