/**
 * THE one assembly of the county's public event set — curated seeds +
 * live feeds (iCal municipal/celebrate/county + Ticketmaster music/sports
 * + Bandsintown) + extracted venue lineups, deduplicated, collapsed,
 * thumb-decorated, and classified.
 *
 * Lifted verbatim from /events' inline assembly (June-9 deep audit P0-5):
 * /today counted ONLY curated seeds for its "This weekend" chip while
 * /events counted this full set, so the two surfaces told the user "1"
 * and "13" for the same weekend. Both pages now call this function, so
 * the numbers cannot diverge again — one query, one truth.
 *
 * Server-only (live fetches). Every async source is fail-soft: a hung or
 * throwing provider degrades to its empty bucket and the result still
 * assembles from curated data. All feed fetches are HTTP-cached upstream
 * (next.revalidate), so concurrent /today + /events renders share cache
 * entries rather than re-fetching.
 */
import {
  allUpcoming,
  dedupeLiveAgainstCurated,
  dedupeCuratedClusters,
  type EventWithMeta,
} from "@/lib/loaders/events";
// Raw (uncached) getLiveEvents on purpose: this call already runs INSIDE
// cachedAssemble (unstable_cache, 300s) below, so wrapping it again would nest
// unstable_cache. /map + /events/[slug], which are NOT inside another cache,
// use getCachedLiveEvents instead.
import { getLiveEvents } from "@/lib/integrations/ical-live";
import {
  fetchTicketmasterMusic,
  fetchTicketmasterSports,
} from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtists } from "@/lib/integrations/bandsintown";
import { BANDSINTOWN_ARTISTS } from "@/data/bandsintown-artists";
import { fetchSeatGeek } from "@/lib/integrations/seatgeek";
import { fetchEventbrite } from "@/lib/integrations/eventbrite";
import { fetchVisitFrederick } from "@/lib/integrations/visitfrederick";
import { fetchFrederickKeys } from "@/lib/integrations/frederickKeys";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import { collapseRecurringEvents, dedupeCrossSourceShows } from "@/lib/events/normalize";
import { venueEventsAsCards, venueEventsToCards } from "@/lib/loaders/venueEvents";
import { fetchSquarespaceVenueEvents } from "@/lib/integrations/squarespace-live";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { upgradeEventGeoms } from "@/lib/integrations/mapboxGeocode";
import { getIngestedSeries } from "@/lib/loaders/ingested";
import { ingestedSeriesToCards } from "@/lib/loaders/ingestedEvents";
import { isPublicEvent } from "@/lib/events/classify";
import { applyEventNotices } from "@/lib/events/notices";
import { hasImplausibleStartTime } from "@/lib/events/visible";
import { easternDayKey } from "@/lib/tz";
import { unstable_cache } from "next/cache";

export type UnifiedEvents = {
  /** Full deduplicated set, BEFORE public/civic laning (the /events page
   *  derives its civic + reminder lanes from this). */
  unified: EventWithMeta[];
  /** isPublicEvent-filtered: what discovery surfaces may count + show. */
  publicEvents: EventWithMeta[];
  /** Honest partial-data signal. A provider timeout/rejection never takes the
   * board down, but the UI must not present that partial set as complete. */
  sourceHealth: EventSourceHealth;
};

export type EventSourceHealth = {
  degraded: boolean;
  unavailable: string[];
};

/**
 * Resolve to `fallback` if `p` rejects OR doesn't settle within `ms`.
 *
 * The per-feed `.catch` handles an upstream that ERRORS, but NOT one that just
 * HANGS (open connection, no response, no error) — which would leave this whole
 * Promise.all pending forever and hang the awaiting Suspense boundary on /events
 * and /today (the "infinite skeleton" launch bug). Racing every feed against a
 * timer means the worst case is a missing source, never a dead board.
 */
function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
  onFailure?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      onFailure?.();
      resolve(fallback);
    }, ms);
  });
  const guarded = Promise.resolve(p).catch(() => {
    onFailure?.();
    return fallback;
  });
  return Promise.race([guarded, timeout]).finally(
    () => clearTimeout(timer),
  );
}
// A single slow/hanging events upstream can't stall the board past this.
const FEED_MS = 8000;

// Exported for offline diagnostics only (tsx scripts can't call the
// unstable_cache wrapper — no Next incremental cache outside the runtime).
// App code must keep calling assembleUnifiedEvents.
export async function assembleRaw(now: Date): Promise<UnifiedEvents> {
  const curatedUpcoming = allUpcoming(now);
  const unavailable = new Set<string>();
  const markUnavailable = (source: string) => () => unavailable.add(source);

  const [liveResult, tmMusic, tmSports, bitEvents, sgEvents, ebEvents, vfEvents, keysEvents, squarespaceRaw, ingestedSeries] = await Promise.all([
    withTimeout(getLiveEvents(60), FEED_MS, {
      events: [] as Awaited<ReturnType<typeof getLiveEvents>>["events"],
      sources_succeeded: [] as string[],
      sources_failed: [] as string[],
    }, markUnavailable("municipal calendars")),
    withTimeout(fetchTicketmasterMusic(), FEED_MS, [], markUnavailable("Ticketmaster music")),
    withTimeout(fetchTicketmasterSports(), FEED_MS, [], markUnavailable("Ticketmaster sports")),
    withTimeout(fetchBandsintownForArtists(BANDSINTOWN_ARTISTS), FEED_MS, [], markUnavailable("Bandsintown")),
    // SeatGeek area discovery (Phase 4 item 3): inert without
    // SEATGEEK_CLIENT_ID, fail-soft like the others.
    withTimeout(fetchSeatGeek(), FEED_MS, [], markUnavailable("SeatGeek")),
    // Eventbrite organizer registry (Phase 4 item 4): inert without
    // EVENTBRITE_TOKEN or an empty registry.
    withTimeout(fetchEventbrite(), FEED_MS, [], markUnavailable("Eventbrite")),
    // Visit Frederick destination-marketing events RSS (keyless Simpleview
    // feed). Partner-confidence county listings; fail-soft to [].
    withTimeout(fetchVisitFrederick(), FEED_MS, [], markUnavailable("Visit Frederick")),
    // Frederick Keys home games from the keyless MLB Stats API. Dedupes against
    // Ticketmaster on the clean slug; fail-soft to [].
    withTimeout(fetchFrederickKeys(), FEED_MS, [], markUnavailable("Frederick Keys")),
    // Squarespace venue lineups (The Banyan, …): runtime-fetched from each
    // venue's `?format=json` events feed. Inert ([]) until a venue carries a
    // `squarespace` URL in live-music-venues.ts.
    withTimeout(fetchSquarespaceVenueEvents(60), FEED_MS, [], markUnavailable("venue calendars")),
    // Cron-ingested PUBLIC draws (FCPL library + FCVFRA fire-company carnivals
    // /bingo) lifted into the rails so the gap-town events that have no other
    // feed read as real "what's on", not a tucked civic row. County CivicEngage
    // is excluded by the adapter (it already arrives via the live county iCal).
    withTimeout(getIngestedSeries(), FEED_MS, [], markUnavailable("ingested calendars")),
  ]);
  const liveEventsRaw = liveResult.events;
  for (const source of liveResult.sources_failed) unavailable.add(source);

  // Live/county + music + sports feeds, curated duplicates dropped.
  const liveCards = dedupeLiveAgainstCurated(
    collapseRecurringEvents(
      // Keys go immediately AFTER tmSports (load-bearing order): on a same-game
      // slug collision the bySlug map keeps the first inserted, so the richer
      // Ticketmaster row (price/tickets) wins and Keys only adds net-new games.
      [...liveEventsRaw, ...tmMusic, ...tmSports, ...keysEvents, ...bitEvents, ...sgEvents, ...ebEvents, ...vfEvents].map(liveToCardEvent),
    ),
    curatedUpcoming,
  );

  // Extracted venue lineups folded into the same feed so a venue with a band
  // tonight reads as an event. Two sources, same EventWithMeta shape + shared
  // adapter: the committed venue-events.json snapshot, and the runtime
  // Squarespace `?format=json` lineups (The Banyan, …). The slug-keyed dedupe
  // below collapses any overlap between them.
  const venueCards = [...venueEventsAsCards(now), ...venueEventsToCards(squarespaceRaw)];

  // FCPL/FCVFRA ingested public draws, expanded series → cards, curated
  // duplicates dropped by the same content matcher the live feeds use.
  const ingestedCards = dedupeLiveAgainstCurated(ingestedSeriesToCards(ingestedSeries, now), curatedUpcoming);

  // Time-sanity guard on FEED/EXTRACTED rows only (curated seeds are
  // hand-authored): a theater curtain at 7 AM is a parsing artifact —
  // withhold it rather than publish a wrong time (June-9 audit P1-11).
  const sane = (e: EventWithMeta) => !hasImplausibleStartTime(e);

  // One unified, deduplicated, time-sorted set; second-pass dedup catches
  // curated-vs-curated duplicates, keeping the richer record per cluster.
  // Ingested cards go LAST so a curated/live row with the same slug always wins
  // (richer record), and so an ingested duplicate the content-dedupe missed
  // still can't override a first-party event.
  const bySlug = new Map<string, EventWithMeta>();
  for (const e of [...curatedUpcoming, ...liveCards.filter(sane), ...venueCards.filter(sane), ...ingestedCards.filter(sane)]) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, e);
  }
  // Centroid-geom repair AFTER dedupe (each unique address geocodes once
  // for the whole merged set) and BEFORE withVenueThumbs, whose fuzzy
  // photo-join paths gate on a precise geocode — an upgraded geom both
  // moves the /map pin onto the venue and opens that join. Fail-soft and
  // 30-day-cached per address (see mapboxGeocode.ts); a warm pass adds ~0.
  // dedupeCrossSourceShows LAST among the dedupes: it needs the whole merged,
  // time-sorted set (the same show arrives from a venue lineup AND a discovery
  // feed with different titles/slugs, one row a bare noon placeholder).
  const positioned = await upgradeEventGeoms(
    dedupeCrossSourceShows(
      dedupeKeysHomeGames(
        dedupeCuratedClusters(
          [...bySlug.values()].sort(
            (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
          ),
        ),
      ),
    ),
  );

  // Owner event-notices stamp LAST, after every dedupe, so a cancellation
  // wins no matter which source's row survived the merge. A cancelled/
  // postponed stamp flows from here to every surface: classify.ts lanes it
  // out of "What's on", cards badge it, the detail banner reads it.
  const unified = applyEventNotices(withVenueThumbs(positioned), now);

  return {
    unified,
    publicEvents: unified.filter(isPublicEvent),
    sourceHealth: {
      degraded: unavailable.size > 0,
      unavailable: [...unavailable],
    },
  };
}

/**
 * Collapse a Frederick Keys home game that arrived from BOTH Ticketmaster and
 * the statsapi feed into one card. The two sources title the same game
 * differently ("Frederick Keys vs. Hudson Valley" vs "…Renegades", or TM's
 * "<Opponent> at Frederick Keys"), so the clean-slug dedupe can miss them. The
 * reliable key is the Eastern calendar DAY: there is at most one Keys home game
 * on a given day in normal play. We prefer the NON-"frederick-keys" row, since
 * Ticketmaster carries price + ticket links; the statsapi feed exists to fill
 * the days Ticketmaster missed. (Caveat: a rare doubleheader collapses to one
 * card — acceptable, and what a ticket gate usually shows anyway; far better
 * than the title-variant double-count this prevents.)
 */
function dedupeKeysHomeGames(events: EventWithMeta[]): EventWithMeta[] {
  const KEYS = /frederick keys/i;
  const seenIdx = new Map<string, number>();
  const out: EventWithMeta[] = [];
  for (const e of events) {
    const isKeysHome = e.category === "sports" && e.municipality === "frederick" && KEYS.test(e.title);
    if (!isKeysHome) {
      out.push(e);
      continue;
    }
    const key = `keys-home-${easternDayKey(new Date(e.starts_at))}`;
    const prevIdx = seenIdx.get(key);
    if (prevIdx === undefined) {
      seenIdx.set(key, out.length);
      out.push(e);
    } else if (out[prevIdx].source === "frederick-keys" && e.source !== "frederick-keys") {
      out[prevIdx] = e; // upgrade to the richer Ticketmaster row
    }
  }
  return out;
}

// Cache the whole assembly per 5-minute bucket so /today + /events stop paying
// the multi-feed fetch (~8s on a cold/uncached render) on EVERY request. The
// cached value is the same serializable EventWithMeta set the pages already
// ship across the RSC boundary to client components, so it round-trips
// through the data cache cleanly. `now` is rounded to a 300s bucket (the cache
// key), matching revalidate, so within a window every render is a HIT and the
// page is fast even though it renders dynamically. The pages still window the
// set against the REAL now (eventsForMode), so "tonight/weekend" stay exact.
// Bump "unified-events-v1" if the assembled shape changes (CLAUDE.md rule).
// The deploy SHA is a second key segment so a shape change ALSO auto-busts the
// cache on deploy even if the manual version bump is forgotten (the #509 lesson).
const cachedAssemble = unstable_cache(
  (bucket: number) => assembleRaw(new Date(bucket * 300_000)),
  // v19: titles now drop trailing embedded weekday/date/time fragments and
  // de-shout ALL-CAPS ("REBEKAH FOSTER … Thursday 7/9/26 6:30PM"), and the
  // new same-day cross-source fuzzy dedupe collapses duplicate rows of one
  // show — cached titles, slugs, and set membership all change.
  // v18: venue-feed events with clearly non-music titles (yoga/trivia/
  // bingo/paint/run club) no longer get the blanket "music" category —
  // the cached rows' category/category_name change.
  ["unified-events-v23", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  // Tagged "events" (isr-1) so the daily ingest crons can revalidateTag the
  // assembled /today + /events pages on demand the moment fresh rows land,
  // instead of fresh data waiting out the 300s TTL + a cold-miss request.
  { revalidate: 300, tags: ["events"] },
);

export async function assembleUnifiedEvents(now: Date): Promise<UnifiedEvents> {
  return cachedAssemble(Math.floor(now.getTime() / 300_000));
}
