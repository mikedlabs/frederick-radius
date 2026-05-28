import { EVENTS as RAW_EVENTS, EVENT_BY_SLUG, type Event } from "@/data/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG, type Municipality } from "@/data/municipalities";
// Client-safe: this loader is imported by "use client" event
// components, so it must use the slim set, not @/lib/loaders/places
// (which static-imports the ~12MB enrichment into the bundle).
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { isKnownClosed } from "@/lib/integrations/closures";
import {
  partitionEvents,
  logPlacementWarnings,
  type Placement,
} from "@/lib/validation/placement";

/**
 * Systemic guard: never surface an event whose venue is a known-closed
 * business (Idiom, etc.). Seed events go stale when a venue shuts;
 * filtering at the source means every loader function is protected without
 * having to remember the filter in each one.
 */
/**
 * Urbana geo-claim — parallel to the one in the places loader. Urbana
 * was added as a community after the data was authored, so an event
 * physically inside its bounds was tagged to a neighbor. Reassign by
 * geography so Urbana is a first-class events town like every other
 * (its by-town list, /m/urbana, aroundTheCounty) and any future
 * curated OR live-feed event in Urbana surfaces with no code change.
 * Scoped to Urbana ONLY; deterministic; no effect elsewhere.
 */
const URBANA_BBOX = MUNICIPALITY_BY_SLUG["urbana"]?.bbox;
function claimUrbanaEvent<T extends { geom: LngLat; municipality: string }>(e: T): T {
  if (!URBANA_BBOX || e.municipality === "urbana") return e;
  const [minLng, minLat, maxLng, maxLat] = URBANA_BBOX;
  const { lng, lat } = e.geom;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
    ? { ...e, municipality: "urbana" }
    : e;
}

// Stage 1: cheap filters that don't touch coordinates.
const STAGE_1 = RAW_EVENTS
  .filter((e) => !isKnownClosed(e.venue_name))
  .map(claimUrbanaEvent);

// Stage 2: validate every event's position against the county bbox.
// Events with a venue_place_slug inherit the verified coord (placement
// "venue"). Standalone events that pass the bbox check are "geocoded".
// Anything else is "needs_review" and never reaches a public surface.
const _placementPartition = partitionEvents(STAGE_1, (slug) => {
  const p = clientPlaceBySlug(slug);
  return p ? { lng: p.geom.lng, lat: p.geom.lat } : null;
});
logPlacementWarnings("events", _placementPartition.needsReview);

// The canonical placement-validated set. Every other loader function in
// this file starts from one of two derived sets so the filtering
// discipline is enforced ONCE, not per call site.
const EVENTS_ALL: ReadonlyArray<Event & { placement: Placement }> =
  _placementPartition.public;

/**
 * What counts as "civic noise" — board meetings, council sessions,
 * public hearings, planning commission. These are real events that a
 * tiny audience (commission watchers, civic-engagement folks) wants to
 * see, but for everyone else they're noise that buries the brewery
 * night under "Frederick County Board of Education Meeting".
 *
 * The ingest pipeline already tags these as category="civic" via
 * the keyword-matchers in ical-live.ts and ingest/ical.ts. We just
 * gate them at the read path so the DEFAULT public surfaces (/today,
 * /events, /map, calendar, by-town pages) hide them, and pages that
 * specifically want civic data opt in.
 */
const CIVIC_CATEGORIES = new Set(["civic"]);
function isCivic(e: Pick<Event, "category">): boolean {
  return CIVIC_CATEGORIES.has(e.category);
}

// PUBLIC events — civic stripped. This is what every "what's happening"
// surface reads. Strictly fewer events than EVENTS_ALL.
const EVENTS: ReadonlyArray<Event & { placement: Placement }> =
  EVENTS_ALL.filter((e) => !isCivic(e));

// Civic-only set, for the opt-in /civic lens (or any future
// commission-tracking surface). Same shape, just the inverse filter.
const EVENTS_CIVIC: ReadonlyArray<Event & { placement: Placement }> =
  EVENTS_ALL.filter((e) => isCivic(e));

/**
 * Events flagged as needs_review (off-bbox, missing geom, or venue
 * slug that didn't resolve). Read-only export for /admin/data-health
 * so editors can fix them before they ship.
 */
export function getNeedsReviewEvents(): ReadonlyArray<
  Event & { placement: "needs_review" }
> {
  return _placementPartition.needsReview;
}

/**
 * User-visible "by town" events view. Default ON by owner directive
 * (2026-05-16: "ship everything"). Set RADIUS_EVENTS_BY_TOWN=0 to
 * disable without a code change (instant rollback). Note: flag-on
 * browser QA for this view was never completed in a prior session, so
 * it should be sanity-checked on the live site after deploy.
 */
export const BY_TOWN_ENABLED = process.env.RADIUS_EVENTS_BY_TOWN !== "0";

/**
 * Radius for the "happening near <town>" fallback so a town with no
 * events of its own is never a dead list. About ten miles, which is a
 * real neighbor distance in a rural county.
 */
const NEAR_TOWN_RADIUS_M = 16_000;

export type EventWithMeta = Event & {
  distance_m?: number;
  category_name: string;
  municipality_name: string;
};

/**
 * Default verification date for seed/curated rows that don't carry
 * their own. The intent is "this season's editorial sweep" — bump
 * this constant when the editor re-walks the seed set so the UI
 * stops claiming stale data is fresh. Per-row dates always win.
 */
const SEED_VERIFIED_AT = "2026-05-14T00:00:00Z";

function decorate(e: Event, origin?: LngLat): EventWithMeta {
  return {
    ...e,
    distance_m: origin ? haversineMeters(origin, e.geom) : undefined,
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
    last_verified_at: e.last_verified_at ?? SEED_VERIFIED_AT,
  };
}

const normLoose = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function titlesMatch(a: string, b: string): boolean {
  const x = normLoose(a);
  const y = normLoose(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  for (let i = 0; i + 6 <= short.length; i++) {
    if (long.includes(short.slice(i, i + 6))) return true;
  }
  return false;
}

function venuesMatch(a: string, b: string): boolean {
  const x = normLoose(a);
  const y = normLoose(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** Same physical place within ~300m — used as a fallback when venue
 *  name strings don't match but the events are clearly co-located.
 *  Closes the Alive @ Five duplicate case where seed venue
 *  "Carroll Creek Amphitheater" and feed venue "Carroll Creek Linear
 *  Park" describe the same spot but share no substring. */
const NEARBY_VENUE_M = 300;
function nearbyVenues(a: EventWithMeta, b: EventWithMeta): boolean {
  if (!a.geom || !b.geom) return false;
  return haversineMeters(a.geom, b.geom) <= NEARBY_VENUE_M;
}

/**
 * Drops live or county-feed events that duplicate a curated event.
 * Curated always wins (P0-4). A live event is a duplicate when titles
 * match, starts are within 60 minutes, and the venues are either name-
 * matched OR geographically co-located (≤300m). Geo fallback closes the
 * Alive @ Five case where seed "Carroll Creek Amphitheater" and feed
 * "Carroll Creek Linear Park" are the same place under different names.
 */
export function dedupeLiveAgainstCurated(
  live: EventWithMeta[],
  curated: EventWithMeta[],
): EventWithMeta[] {
  return live.filter((l) => {
    const lt = +new Date(l.starts_at);
    return !curated.some((c) => {
      const within = Math.abs(+new Date(c.starts_at) - lt) <= 60 * 60 * 1000;
      if (!within) return false;
      if (!titlesMatch(c.title, l.title)) return false;
      return venuesMatch(c.venue_name, l.venue_name) || nearbyVenues(c, l);
    });
  });
}

export function getEventBySlug(slug: string): (EventWithMeta & { venue_place_name?: string }) | null {
  const e = EVENT_BY_SLUG[slug];
  if (!e) return null;
  const venue = e.venue_place_slug ? clientPlaceBySlug(e.venue_place_slug) : null;
  return {
    ...decorate(e),
    venue_place_name: venue?.name,
  };
}

/**
 * Stable identity for a recurring series. We derive it from the part of
 * the title before the first " · " / " — " separator (so "Alive @ Five ·
 * The National Bohemians" and "Alive @ Five — Opening Night · 24K Event
 * Band" both collapse to "alive @ five") plus the venue. Non-recurring
 * one-offs get a unique key (their own slug) so they never group.
 */
export function seriesKey(e: Event): string {
  if (!e.is_recurring) return `__one_off__${e.slug}`;
  const base = e.title.split(/\s+[·—–-]\s+/)[0].trim().toLowerCase();
  return `${base}@@${(e.venue_name || "").toLowerCase()}`;
}

/** The distinguishing tail of a series title, e.g. "The National Bohemians". */
export function seriesOccurrenceLabel(e: Event): string | null {
  const parts = e.title.split(/\s+[·—–-]\s+/);
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

/**
 * All OTHER upcoming dates in the same recurring series as `slug`,
 * chronologically. Empty for one-off events.
 */
export function getEventSeries(slug: string, now: Date = new Date()): EventWithMeta[] {
  const e = EVENT_BY_SLUG[slug];
  if (!e || !e.is_recurring) return [];
  const key = seriesKey(e);
  return EVENTS
    .filter(
      (x) =>
        x.slug !== slug &&
        seriesKey(x) === key &&
        new Date(x.ends_at) >= now
    )
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((x) => decorate(x));
}

/** All events on a given calendar day (local America/New_York). */
export function eventsOnDay(day: Date): EventWithMeta[] {
  const y = day.getFullYear();
  const m = day.getMonth();
  const d = day.getDate();
  return EVENTS
    .filter((e) => {
      const s = new Date(e.starts_at);
      return s.getFullYear() === y && s.getMonth() === m && s.getDate() === d;
    })
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((e) => decorate(e));
}

export function eventsLive(now: Date = new Date()): EventWithMeta[] {
  return EVENTS
    .filter((e) => {
      const start = new Date(e.starts_at);
      const end = new Date(e.ends_at);
      return start <= now && end >= now;
    })
    .map((e) => decorate(e));
}

export function eventsNext24h(now: Date = new Date()): EventWithMeta[] {
  const end = new Date(now);
  end.setHours(end.getHours() + 24);
  return EVENTS
    .filter((e) => {
      const s = new Date(e.starts_at);
      return s >= now && s < end;
    })
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((e) => decorate(e));
}

export function eventsWeekend(now: Date = new Date()): EventWithMeta[] {
  const dow = now.getDay();
  const friday = new Date(now);
  friday.setDate(friday.getDate() + ((5 - dow + 7) % 7));
  friday.setHours(17, 0, 0, 0);
  const monday = new Date(friday);
  monday.setDate(monday.getDate() + 3);
  monday.setHours(0, 0, 0, 0);
  return EVENTS
    .filter((e) => {
      const s = new Date(e.starts_at);
      return s >= friday && s < monday;
    })
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((e) => decorate(e));
}

export function eventsInMunicipality(slug: string, futureOnly = true, now: Date = new Date()): EventWithMeta[] {
  return EVENTS
    .filter((e) => e.municipality === slug && (!futureOnly || new Date(e.ends_at) >= now))
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((e) => decorate(e));
}

export function allUpcoming(now: Date = new Date(), limit?: number): EventWithMeta[] {
  const out = EVENTS
    .filter((e) => new Date(e.ends_at) >= now)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((e) => decorate(e));
  return limit ? out.slice(0, limit) : out;
}

/**
 * Civic-only upcoming events — board meetings, public hearings,
 * planning commissions. Opt-in counterpart to allUpcoming(). Used by
 * the dedicated "Civic" lens / future /civic surface. Default views
 * never call this — they call allUpcoming() which has civic stripped.
 */
export function civicUpcoming(now: Date = new Date(), limit?: number): EventWithMeta[] {
  const out = EVENTS_CIVIC
    .filter((e) => new Date(e.ends_at) >= now)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((e) => decorate(e));
  return limit ? out.slice(0, limit) : out;
}

/** Identify a civic event by category. Exported so consumers that
 *  merge live-feed events with the curated set (e.g. /events) can apply
 *  the same filter to feed-sourced rows — those bypass the EVENTS
 *  read path entirely. */
export function isCivicEvent(e: Pick<Event, "category">): boolean {
  return isCivic(e);
}

export function formatEventWhen(e: Event): string {
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  const sameDay = start.toDateString() === end.toDateString();
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (sameDay) {
    return `${dateFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(end)}`;
  }
  return `${dateFmt.format(start)} – ${dateFmt.format(end)}`;
}

export function eventDateBlock(e: Event): { weekday: string; day: string; month: string; time: string } {
  const start = new Date(e.starts_at);
  const tz = "America/New_York";
  return {
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(start),
    day: new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(start),
    month: new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(start).toUpperCase(),
    time: new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(start),
  };
}

export type TownEvents = {
  municipality: Municipality;
  events: EventWithMeta[];
  nearby: EventWithMeta[];
};

/**
 * Upcoming events near a town centroid, excluding events already in that
 * town. This backs the "happening near <town>" fallback so an empty town
 * is never a dead end. Distance is measured from the town centroid.
 */
export function nearTown(
  slug: string,
  now: Date = new Date(),
  limit = 4,
): EventWithMeta[] {
  const m = MUNICIPALITY_BY_SLUG[slug];
  if (!m) return [];
  return EVENTS
    .filter((e) => e.municipality !== slug && new Date(e.ends_at) >= now)
    .map((e) => decorate(e, m.centroid))
    .filter((e) => (e.distance_m ?? Infinity) <= NEAR_TOWN_RADIUS_M)
    .sort((a, b) => {
      const d = (a.distance_m ?? 0) - (b.distance_m ?? 0);
      return d !== 0 ? d : +new Date(a.starts_at) - +new Date(b.starts_at);
    })
    .slice(0, limit);
}

/**
 * Every municipality, in declared order, with its own upcoming events
 * and a centroid-radius fallback. The caller renders all twelve at equal
 * weight, so a town with one event is featured as deliberately as the
 * county seat. The layout is never proportional to event volume.
 */
export function eventsByTown(now: Date = new Date()): TownEvents[] {
  return MUNICIPALITIES.map((municipality) => ({
    municipality,
    events: eventsInMunicipality(municipality.slug, true, now),
    nearby: nearTown(municipality.slug, now),
  }));
}

/**
 * The soonest single upcoming event in each town other than Frederick,
 * sorted by start time. This guarantees small-town representation in the
 * all-county view so Frederick volume never crowds the county out.
 */
export function aroundTheCounty(now: Date = new Date()): EventWithMeta[] {
  const out: EventWithMeta[] = [];
  for (const m of MUNICIPALITIES) {
    if (m.slug === "frederick") continue;
    const next = eventsInMunicipality(m.slug, true, now)[0];
    if (next) out.push(next);
  }
  return out.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
}
