import { EVENTS as RAW_EVENTS, EVENT_BY_SLUG, type Event } from "@/data/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG, type Municipality } from "@/data/municipalities";
// Client-safe: this loader is imported by "use client" event
// components, so it must use the slim set, not @/lib/loaders/places
// (which static-imports the ~12MB enrichment into the bundle).
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { stampEventProvenance, type Provenance } from "@/lib/provenance";
import { eventGeoConfidence, type GeoConfidence } from "@/lib/events/geo-confidence";
import { isKnownClosed } from "@/lib/integrations/closures";
import { easternParts, easternDayKey, easternWallToUtcISO } from "@/lib/tz";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import {
  partitionEvents,
  logPlacementWarnings,
  type Placement,
} from "@/lib/validation/placement";
import { cleanDescription } from "@/lib/events/normalize";
import {
  eventAttendanceMode,
  hasPhysicalAttendance,
} from "@/lib/events/attendance";

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

export type EventWithMeta = Event &
  Omit<Provenance, "source" | "source_url"> & {
  distance_m?: number;
  /** How well we know the position. A distance is only ever stamped for
   *  "venue_match"/"exact_address"; "area"/"unknown" list without one. */
  geo_confidence: GeoConfidence;
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
  const attendance_mode = eventAttendanceMode(e);
  const physical = hasPhysicalAttendance({ ...e, attendance_mode });
  const geo_confidence = physical ? eventGeoConfidence(e) : "unknown";
  const precise = geo_confidence === "venue_match" || geo_confidence === "exact_address";
  return {
    ...e,
    attendance_mode,
    // Description cleaned at the loader boundary so a feed's raw metadata
    // dump ("Event date: … Event Time: … Location: …") never reaches a card
    // reason, the detail body, or an OG/meta blurb — one strip, every
    // surface, instead of a render-time patch per component.
    description: cleanDescription(e.description),
    // A distance is a promise: only stamp it when the coordinate is
    // addressable. An area-centroid event still lists, but never claims
    // "113 ft away" (audit #2 P1). See lib/events/geo-confidence.
    distance_m: origin && precise && physical ? haversineMeters(origin, e.geom) : undefined,
    geo_confidence,
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
    // Provenance (4.1, event side): stamped at the same boundary that
    // cleans the description, so every event row carries the seven
    // fields with the curated seed verification date.
    ...stampEventProvenance(e, e.last_verified_at ?? SEED_VERIFIED_AT),
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

/**
 * Stronger version of titlesMatch — requires one title to FULLY contain
 * the other (substring), not just share a 6-character run. Used as the
 * confidence signal for cross-source dedup where venue names differ
 * (e.g. an event listed as "Downtown Frederick Partnership-Alive @
 * Five" by a municipal feed vs "Alive @ Five · The National Bohemians"
 * by the curated set — same actual event, totally different feeds).
 */
function titlesMatchStrong(a: string, b: string): boolean {
  const x = normLoose(a);
  const y = normLoose(b);
  if (!x || !y || x.length < 4 || y.length < 4) return false;
  return x.includes(y) || y.includes(x);
}

function venuesMatch(a: string, b: string): boolean {
  const x = normLoose(a);
  const y = normLoose(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Drops live or county-feed events that duplicate a curated event.
 * Curated always wins (P0-4). A live event is a duplicate when:
 *
 *   1. starts within 60 minutes AND venues + titles both match
 *      (conservative, requires all three signals — original P0-4 rule)
 *   OR
 *   2. starts within 60 minutes AND titles match STRONGLY (one contains
 *      the other, ≥4 chars) regardless of venue (May 2026 — catches
 *      cross-source dupes where the municipal feed lists the venue as
 *      "Frederick County Calendar" while curated lists "Carroll Creek
 *      Amphitheater")
 *
 * Distinct events with similar names but different times never merge
 * (the 60-minute window is non-negotiable).
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
      // Path 1: conservative all-three-signal match
      if (venuesMatch(c.venue_name, l.venue_name) && titlesMatch(c.title, l.title)) {
        return true;
      }
      // Path 2: strong title match — venue divergence is OK because
      // municipal feeds use generic placeholders ("Frederick County
      // Calendar") that won't match the curated specific venue.
      if (titlesMatchStrong(c.title, l.title)) {
        return true;
      }
      return false;
    });
  });
}

/**
 * Curated-vs-curated dedup pass. Some "curated" events come in via the
 * municipal calendar ingestion pipeline AND from the hand-curated set —
 * same event, two sources. Without this pass, /events showed e.g.
 * "Alive @ Five · The Learned Doctors" (hand-curated) alongside
 * "Downtown Frederick Partnership-Alive @ Five" (municipal feed
 * ingested as curated). Both rendered, same physical event.
 *
 * Picks the BETTER version from each cluster:
 *   - Has hero_image > no hero_image (richer card)
 *   - Has description > no description
 *   - Otherwise keep the earlier entry (stable)
 */
export function dedupeCuratedClusters(events: EventWithMeta[]): EventWithMeta[] {
  const out: EventWithMeta[] = [];
  for (const e of events) {
    const t = +new Date(e.starts_at);
    const dupeIdx = out.findIndex((kept) => {
      const kt = +new Date(kept.starts_at);
      if (Math.abs(kt - t) > 60 * 60 * 1000) return false;
      return titlesMatchStrong(kept.title, e.title);
    });
    if (dupeIdx === -1) {
      out.push(e);
      continue;
    }
    // Pick the richer record between the two.
    const kept = out[dupeIdx];
    const challengerScore =
      (e.hero_image ? 2 : 0) + (e.description ? 1 : 0);
    const keptScore =
      (kept.hero_image ? 2 : 0) + (kept.description ? 1 : 0);
    if (challengerScore > keptScore) {
      out[dupeIdx] = e;
    }
  }
  return out;
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

/** All events on a given calendar day (America/New_York).
 *  Compares Eastern day-keys, not server-local Date parts — otherwise a
 *  late-evening Eastern event (stored as next-day UTC) lands on the
 *  wrong day on a UTC production server. */
export function eventsOnDay(day: Date): EventWithMeta[] {
  const key = easternDayKey(day);
  return EVENTS
    .filter((e) => easternDayKey(new Date(e.starts_at)) === key)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((e) => decorate(e));
}

export function eventsLive(now: Date = new Date()): EventWithMeta[] {
  // The shared liveness gate (eventWhenLabel.isEventLiveNow): trusting the
  // stated end unconditionally kept a noon event with an end-of-day stamp
  // "Live now" at 11 PM (beta-reviewer catch, Jul 2026).
  return EVENTS.filter((e) => isEventLiveNow(e, now)).map((e) => decorate(e));
}

export function eventsNext24h(now: Date = new Date()): EventWithMeta[] {
  // Rolling 24h window — absolute-time arithmetic so it's DST- and
  // timezone-safe (the old setHours(getHours()+24) read server-local
  // hours and could drift an hour across the DST switch).
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return EVENTS
    .filter((e) => {
      const s = new Date(e.starts_at);
      return s >= now && s < end;
    })
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((e) => decorate(e));
}

export function eventsWeekend(now: Date = new Date()): EventWithMeta[] {
  // Weekend = upcoming Fri 17:00 → Mon 00:00, all America/New_York.
  // The old version used server-local getDay()/setHours(17), so on a
  // UTC production server the window was ~Fri 1 PM → Sun 8 PM Eastern
  // (the P0 date-window bug). Build the boundaries as Eastern wall
  // times converted to the correct UTC instants instead.
  const et = easternParts(now);
  const daysToFri = (5 - et.weekday + 7) % 7;
  // Walk the Eastern calendar by constructing a noon-UTC date and
  // re-reading its Eastern parts, so month/year rollover is correct.
  const friBase = easternParts(new Date(Date.UTC(et.year, et.month - 1, et.day + daysToFri, 12)));
  const monBase = easternParts(new Date(Date.UTC(et.year, et.month - 1, et.day + daysToFri + 3, 12)));
  const friStart = Date.parse(easternWallToUtcISO(friBase.year, friBase.month, friBase.day, 17, 0));
  const monStart = Date.parse(easternWallToUtcISO(monBase.year, monBase.month, monBase.day, 0, 0));
  return EVENTS
    .filter((e) => {
      const s = +new Date(e.starts_at);
      return s >= friStart && s < monStart;
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

// Pure date formatters moved to src/lib/events/format.ts (data-free) so
// client components can import them WITHOUT dragging this module's
// places-client static import into their bundle (the 1.8 MB /events chunk
// leak). Re-exported here so existing SERVER callers are untouched — client
// components must import from "@/lib/events/format" directly.
export { formatEventWhen, eventDateBlock } from "@/lib/events/format";

export type TownEvents = {
  municipality: Municipality;
  events: EventWithMeta[];
  nearby: EventWithMeta[];
};

/**
 * Upcoming events near a town centroid, excluding events already in that
 * town. This backs the "happening near <town>" fallback so an empty town
 * is never a dead end.
 *
 * The centroid-to-event distance is used to FILTER and ORDER the
 * fallback (a coarse "neighbor" measure, fine at the ~10-mile scale), but
 * it is computed internally — the rendered `distance_m` stays gated by
 * geo confidence in decorate(), so an area-centroid event shows up in
 * the list without claiming a precise distance (audit #2 P1).
 */
export function nearTown(
  slug: string,
  now: Date = new Date(),
  limit = 4,
): EventWithMeta[] {
  const m = MUNICIPALITY_BY_SLUG[slug];
  if (!m) return [];
  const centroid = m.centroid;
  return EVENTS
    .filter((e) => e.municipality !== slug && new Date(e.ends_at) >= now)
    .map((e) => ({ e, near_m: haversineMeters(centroid, e.geom) }))
    .filter((x) => x.near_m <= NEAR_TOWN_RADIUS_M)
    .sort((a, b) =>
      a.near_m !== b.near_m
        ? a.near_m - b.near_m
        : +new Date(a.e.starts_at) - +new Date(b.e.starts_at),
    )
    .slice(0, limit)
    .map((x) => decorate(x.e, centroid));
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
