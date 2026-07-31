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
// cachedAssemble (unstable_cache, 840s) below, so wrapping it again would nest
// unstable_cache. The /events/[slug] fallback, which is NOT inside another
// cache, uses getCachedLiveEvents instead.
import {
  fetchLiveTicketmasterMusicResult,
  getLiveEvents,
  runPublicEventAdapter,
  type LiveEvent,
} from "@/lib/integrations/ical-live";
import {
  fetchTicketmasterSportsResult,
} from "@/lib/integrations/ticketmaster";
import { fetchBandsintownForArtistsResult } from "@/lib/integrations/bandsintown";
import { BANDSINTOWN_ARTISTS } from "@/data/bandsintown-artists";
import { fetchSeatGeekResult } from "@/lib/integrations/seatgeek";
import { fetchEventbriteResult } from "@/lib/integrations/eventbrite";
import { fetchVisitFrederickResult } from "@/lib/integrations/visitfrederick";
import { fetchFrederickKeysResult } from "@/lib/integrations/frederickKeys";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import {
  cleanVenueName,
  collapseRecurringEvents,
  dedupeCrossSourceShows,
  isFacilityBooking,
  stripFacilityPrefix,
  titleIsJustVenue,
} from "@/lib/events/normalize";
import {
  venueEventsAsCards,
  venueEventsToCards,
  type VenueEvent,
} from "@/lib/loaders/venueEvents";
import { fetchSquarespaceVenueEventsResult } from "@/lib/integrations/squarespace-live";
import { withVenueThumbs } from "@/lib/loaders/eventThumb";
import { upgradeEventGeoms } from "@/lib/integrations/mapboxGeocode";
import { getIngestedSeries } from "@/lib/loaders/ingested";
import { ingestedSeriesToCards } from "@/lib/loaders/ingestedEvents";
import { isPublicEvent } from "@/lib/events/classify";
import { applyEventNotices } from "@/lib/events/notices";
import { hasImplausibleStartTime } from "@/lib/events/visible";
import { easternDayKey } from "@/lib/tz";
import { unstable_cache } from "next/cache";
import { createSingleFlight } from "@/lib/single-flight";
import {
  eventAdapterFailed,
  eventAdapterIsDegraded,
  type EventAdapterResult,
} from "@/lib/integrations/event-adapter-result";
import { mapEventSourcesWithConcurrency } from "@/lib/integrations/event-source-circuit";

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
 * The persistent cache stores one event array, not both `unified` and its
 * nearly identical `publicEvents` subset. Serializing both pushed the cache
 * entry above Next's 2 MB limit, so the write failed and every Today request
 * fetched every live calendar again. Public eligibility is deterministic and
 * cheap to derive after the cache read.
 */
export type UnifiedEventsCachePayload = Pick<
  UnifiedEvents,
  "unified" | "sourceHealth"
>;

export function compactUnifiedEvents(
  result: UnifiedEvents,
): UnifiedEventsCachePayload {
  return {
    unified: result.unified,
    sourceHealth: result.sourceHealth,
  };
}

export function hydrateUnifiedEvents(
  cached: UnifiedEventsCachePayload,
): UnifiedEvents {
  return {
    ...cached,
    publicEvents: cached.unified.filter(isPublicEvent),
  };
}

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

/**
 * A timeout must stop the work, not merely stop awaiting it. Without this,
 * abandoned fetches can keep a streamed route open after its fallback has
 * rendered, so the browser never reaches `DOMContentLoaded`.
 */
export function withAbortableTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  fallback: T,
  onFailure?: () => void,
): Promise<T> {
  const controller = new AbortController();
  return withTimeout(
    Promise.resolve().then(() => work(controller.signal)),
    ms,
    fallback,
    () => {
      controller.abort();
      onFailure?.();
    },
  );
}

// A single slow/hanging events upstream can't stall the board past this.
const FEED_MS = 8000;

function readAdapter<T>(
  resultFactory: () => Promise<EventAdapterResult<T>>,
  source: string,
  unavailable: Set<string>,
  circuitKey = source,
  timeoutMs = FEED_MS,
): Promise<T[]> {
  const markUnavailable = () => unavailable.add(source);
  return withTimeout(
    runPublicEventAdapter(circuitKey, resultFactory),
    timeoutMs,
    eventAdapterFailed<T>(),
    markUnavailable,
  ).then((result) => {
    if (eventAdapterIsDegraded(result)) markUnavailable();
    return result.items;
  });
}

// Exported for offline diagnostics only (tsx scripts can't call the
// unstable_cache wrapper — no Next incremental cache outside the runtime).
// App code must keep calling assembleUnifiedEvents.
export async function assembleRaw(now: Date): Promise<UnifiedEvents> {
  const traceStartedAt = Date.now();
  if (process.env.CI) console.info("[today-render] assemble-raw:start");
  const curatedUpcoming = allUpcoming(now);
  const unavailable = new Set<string>();
  const markUnavailable = (source: string) => () => unavailable.add(source);

  type LiveAdapterKey =
    | "tmMusic"
    | "tmSports"
    | "bandsintown"
    | "seatgeek"
    | "eventbrite"
    | "visitFrederick"
    | "frederickKeys";
  const liveAdapterSources: Array<{
    key: LiveAdapterKey;
    label: string;
    read: () => Promise<EventAdapterResult<LiveEvent>>;
  }> = [
    {
      key: "tmMusic",
      label: "Ticketmaster music",
      read: fetchLiveTicketmasterMusicResult,
    },
    {
      key: "tmSports",
      label: "Ticketmaster sports",
      read: fetchTicketmasterSportsResult,
    },
    {
      key: "bandsintown",
      label: "Bandsintown",
      read: () => fetchBandsintownForArtistsResult(BANDSINTOWN_ARTISTS),
    },
    {
      key: "seatgeek",
      label: "SeatGeek",
      read: fetchSeatGeekResult,
    },
    {
      key: "eventbrite",
      label: "Eventbrite",
      read: fetchEventbriteResult,
    },
    {
      key: "visitFrederick",
      label: "Visit Frederick",
      read: fetchVisitFrederickResult,
    },
    {
      key: "frederickKeys",
      label: "Frederick Keys",
      read: fetchFrederickKeysResult,
    },
  ];
  type AdapterFanoutResult =
    | { key: LiveAdapterKey; items: LiveEvent[] }
    | { key: "venueCalendars"; items: VenueEvent[] };
  const adapterFanoutDeadlineMs = Date.now() + FEED_MS;
  const adapterTasks: Array<() => Promise<AdapterFanoutResult>> = [
    ...liveAdapterSources.map((adapter) => async () => {
      const remainingMs = adapterFanoutDeadlineMs - Date.now();
      if (remainingMs <= 0) {
        unavailable.add(adapter.label);
        return { key: adapter.key, items: [] };
      }
      return {
        key: adapter.key,
        items: await readAdapter(
          adapter.read,
          adapter.label,
          unavailable,
          adapter.key === "tmMusic"
            ? "ticketmaster-music"
            : adapter.label,
          remainingMs,
        ),
      };
    }),
    async () => {
      const remainingMs = adapterFanoutDeadlineMs - Date.now();
      if (remainingMs <= 0) {
        unavailable.add("venue calendars");
        return { key: "venueCalendars", items: [] };
      }
      return {
        key: "venueCalendars",
        items: await readAdapter(
          () => fetchSquarespaceVenueEventsResult(60),
          "venue calendars",
          unavailable,
          "venue calendars",
          remainingMs,
        ),
      };
    },
  ];

  const [liveResult, adapterResults, ingestedSeries] = await Promise.all([
    // The unified assembly owns Ticketmaster as a separately monitored
    // adapter below. Excluding it from this municipal-feed fanout prevents the
    // same Discovery request from running twice on every cold assembly.
    withAbortableTimeout(
      (signal) =>
        getLiveEvents(60, {
          includeTicketmaster: false,
          signal,
        }),
      FEED_MS,
      {
        events: [] as Awaited<ReturnType<typeof getLiveEvents>>["events"],
        sources_succeeded: [] as string[],
        sources_failed: [] as string[],
      },
      markUnavailable("municipal calendars"),
    ),
    // Keep the independent adapters under a hard fanout cap. Their individual
    // deadlines still apply; this prevents a cold board from opening every
    // ticketing, destination, sports, and venue connection simultaneously.
    mapEventSourcesWithConcurrency(
      adapterTasks,
      4,
      (read) => read(),
    ),
    // Cron-ingested PUBLIC draws (FCPL library + FCVFRA fire-company carnivals
    // /bingo) lifted into the rails so the gap-town events that have no other
    // feed read as real "what's on", not a tucked civic row. County CivicEngage
    // is excluded by the adapter (it already arrives via the live county iCal).
    withTimeout(getIngestedSeries(), FEED_MS, [], markUnavailable("ingested calendars")),
  ]);
  if (process.env.CI) {
    console.info(
      `[today-render] assemble-raw:fanout-settled ${Date.now() - traceStartedAt}ms`,
    );
  }
  const liveAdapterItems = new Map<LiveAdapterKey, LiveEvent[]>();
  let squarespaceRaw: VenueEvent[] = [];
  for (const result of adapterResults) {
    if (result.key === "venueCalendars") {
      squarespaceRaw = result.items;
    } else {
      liveAdapterItems.set(result.key, result.items);
    }
  }
  const tmMusic = liveAdapterItems.get("tmMusic") ?? [];
  const tmSports = liveAdapterItems.get("tmSports") ?? [];
  const bitEvents = liveAdapterItems.get("bandsintown") ?? [];
  const sgEvents = liveAdapterItems.get("seatgeek") ?? [];
  const ebEvents = liveAdapterItems.get("eventbrite") ?? [];
  const vfEvents = liveAdapterItems.get("visitFrederick") ?? [];
  const keysEvents = liveAdapterItems.get("frederickKeys") ?? [];
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

  // Three guards on FEED/EXTRACTED rows only (curated seeds are hand-authored):
  //   1. Time sanity — a theater curtain at 7 AM is a parsing artifact;
  //      withhold it rather than publish a wrong time (June-9 audit P1-11).
  //   2. Title says something — a lineup placeholder titled with the venue's
  //      own name ("JoJo's Restaurant & Tap House" at JoJo's) is not an event
  //      (Reddit reader report, 2026-07-17).
  //   3. A facility BOOKING is not a happening — municipal calendars publish
  //      pavilion rentals and program blocks (even a private memorial) beside
  //      real events (2026-07-17 today-page review).
  const sane = (e: EventWithMeta) =>
    !hasImplausibleStartTime(e) &&
    !titleIsJustVenue(e.title, e.venue_name) &&
    !isFacilityBooking(e.title);

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
  // One venue-name cleaning pass for EVERY surface: cleanVenueName nulls
  // degenerate scraps a feed leaked into its location field ("MD", a bare
  // county, metadata dumps) so no card ever renders "at MD ·" copy. Real
  // names pass through untouched; done before the dedupes so venue-keyed
  // matching compares cleaned values.
  const venueCleaned = [...bySlug.values()].map((e) => {
    const v = cleanVenueName(e.venue_name) ?? "";
    const t = stripFacilityPrefix(e.title);
    return v === e.venue_name && t === e.title ? e : { ...e, venue_name: v, title: t };
  });
  // Dedupe + time-sort produces the floor every surface can fall back to.
  const deduped = dedupeCrossSourceShows(
    dedupeKeysHomeGames(
      dedupeCuratedClusters(
        venueCleaned.sort(
          (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
        ),
      ),
    ),
  );

  // Three tail decorations follow: the geocode upgrade, the venue-photo join,
  // and the owner event-notices stamp. assembleRaw feeds /today, /events,
  // /live-music and /check-a-date off ONE cached call, and each op has a throw
  // path, so an unguarded failure would take all four surfaces to the error
  // boundary at once. Each is wrapped to degrade to its input — a missing
  // pin-upgrade, thumbnail, or notice is invisible; a dead board is not.
  let positioned = deduped;
  try {
    if (process.env.CI) console.info("[today-render] assemble-raw:geocode-start");
    positioned = await upgradeEventGeoms(deduped);
    if (process.env.CI) console.info("[today-render] assemble-raw:geocode-settled");
  } catch {
    // Geocode upgrade failed — pins stay at their pre-upgrade geom.
  }

  let decorated = positioned;
  try {
    decorated = withVenueThumbs(positioned);
  } catch {
    // Photo join failed — cards render without the venue thumb.
  }

  // Owner event-notices stamp LAST, after every dedupe, so a cancellation wins
  // no matter which source's row survived the merge. A cancelled/postponed
  // stamp flows to every surface: classify.ts lanes it out of "What's on",
  // cards badge it, the detail banner reads it.
  let unified = decorated;
  try {
    unified = applyEventNotices(decorated, now);
  } catch {
    // Notice stamp failed — cards render without cancel/postpone badges.
  }

  if (process.env.CI) {
    console.info(
      `[today-render] assemble-raw:complete ${Date.now() - traceStartedAt}ms`,
    );
  }

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

// Cache the compact current assembly under one stable key so /today + /events
// stop paying the multi-feed fetch (~8s on a cold/uncached render) on EVERY
// request. The
// cached value carries the unified EventWithMeta set only; `publicEvents` is a
// deterministic subset rebuilt after the cache read. Keeping both arrays in
// the cache duplicated almost the entire corpus and crossed Next's 2 MB item
// ceiling. A time bucket must NOT be an unstable_cache argument: arguments are
// part of its key, which created a brand-new cold entry every five minutes and
// defeated stale-while-revalidate. The stable entry can now return its last
// good value while Next refreshes it after 840 seconds. The pages still window
// the set against their real `now`, so "tonight/weekend" stay exact.
// Keep this expensive source cache stable across ordinary deploys so a release
// does not hand the first visitor an eight-second cold fetch. Any output-shape
// change MUST bump the explicit vNN key below; ingest paths can also invalidate
// the shared "events" tag when fresh data lands.
const assembleOnce = createSingleFlight<number, UnifiedEventsCachePayload>();

const cachedAssemble = unstable_cache(
  () => {
    const bucket = Math.floor(Date.now() / 300_000);
    return assembleOnce(bucket, async () =>
      compactUnifiedEvents(await assembleRaw(new Date(bucket * 300_000))),
    );
  },
  // v19: titles now drop trailing embedded weekday/date/time fragments and
  // de-shout ALL-CAPS ("REBEKAH FOSTER … Thursday 7/9/26 6:30PM"), and the
  // new same-day cross-source fuzzy dedupe collapses duplicate rows of one
  // show — cached titles, slugs, and set membership all change.
  // v18: venue-feed events with clearly non-music titles (yoga/trivia/
  // bingo/paint/run club) no longer get the blanket "music" category —
  // the cached rows' category/category_name change.
  // v24: cache one event array under a stable invocation key instead of
  // serializing both `unified` and its `publicEvents` subset in a new entry
  // every five minutes. This keeps the item below Next's 2 MB cache limit and
  // lets stale-while-revalidate work.
  ["unified-events-v24"],
  // Tagged "events" (isr-1) so the daily ingest crons can revalidateTag the
  // assembled /today + /events pages on demand the moment fresh rows land,
  // instead of fresh data waiting out the cache TTL + a cold-miss request.
  // Keep the lifetime one minute below the fifteen-minute warm cron. An exact
  // 900/900 match can miss its boundary because a cache timestamp is written
  // after the upstream fetch completes, silently stretching refreshes to 30m.
  // The previous five-minute lifetime expired twice between warm runs, so
  // ordinary Today regenerations repeatedly paid the full multi-feed assembly
  // and geocode pass in the foreground/background function invocation.
  { revalidate: 840, tags: ["events"] },
);

export async function assembleUnifiedEvents(now: Date): Promise<UnifiedEvents> {
  // The app always requests a current feed snapshot, while diagnostics may
  // deliberately assemble a historical/future instant. Preserve that explicit
  // behavior without fragmenting the hot user-facing cache by timestamp.
  const isCurrent = Math.abs(now.getTime() - Date.now()) <= 300_000;
  if (!isCurrent) return assembleRaw(now);

  const cached = await cachedAssemble();
  if (process.env.CI) console.info("[today-render] cached-assemble:settled");
  return hydrateUnifiedEvents(cached);
}
