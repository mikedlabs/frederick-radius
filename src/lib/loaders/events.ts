import { EVENTS as RAW_EVENTS, EVENT_BY_SLUG, type Event } from "@/data/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG, type Municipality } from "@/data/municipalities";
// Client-safe: this loader is imported by "use client" event
// components, so it must use the slim set, not @/lib/loaders/places
// (which static-imports the ~12MB enrichment into the bundle).
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { stampEventProvenance, type EventProvenance } from "@/lib/provenance";
import { eventGeoConfidence, type GeoConfidence } from "@/lib/events/geo-confidence";
import { isKnownClosed } from "@/lib/integrations/closures";
import { easternParts, easternDayKey, easternWallToUtcISO } from "@/lib/tz";
import { isEventLiveNow } from "@/lib/eventWhenLabel";
import { isUpcomingEvent } from "@/lib/events/visible";
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

export type EventWithMeta = Omit<Event, "source_url" | "last_verified_at"> &
  EventProvenance & {
  /** Publisher record edit time; unlike a fetch time, this can settle copy. */
  publisher_updated_at?: string | null;
  distance_m?: number;
  /** How well we know the position. A distance is only ever stamped for
   *  "venue_match"/"exact_address"; "area"/"unknown" list without one. */
  geo_confidence: GeoConfidence;
  category_name: string;
  municipality_name: string;
};

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
    // Provenance (event side): keep a missing per-row verification date
    // explicitly null. A cohort date is not evidence that this event was
    // checked, and silently adding one made stale curated rows look fresh.
    ...stampEventProvenance(e),
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
 * Some publishers lead a recurring program with the series name and put the
 * week's performer after punctuation ("Alive @ Five · Conor & the Wild
 * Hunt"). A second feed can carry stale performer copy for the same program.
 * Title similarity cannot catch that conflict, but a substantial shared
 * series prefix plus the same venue and clock can. Keep this intentionally
 * narrow: the prefix must name a recognizable series, not a generic word such
 * as "music" or "trivia".
 */
function recurringSeriesLabel(title: string): string | null {
  const prefix =
    title.split(/(?:\s+[·|–—]\s*|\s*:\s*|\s+-\s+)/u, 1)[0]?.trim() ?? "";
  return normLoose(prefix).length >= 8 ? prefix : null;
}

function recurringSeriesTitle(title: string): string | null {
  const prefix = recurringSeriesLabel(title);
  return prefix ? normLoose(prefix) : null;
}

function sameRecurringSeries(a: EventWithMeta, b: EventWithMeta): boolean {
  const aSeries = recurringSeriesTitle(a.title);
  const bSeries = recurringSeriesTitle(b.title);
  return Boolean(
    aSeries &&
      bSeries &&
      aSeries === bSeries &&
      (a.is_recurring || b.is_recurring),
  );
}

const SERIES_OCCURRENCE_TOLERANCE_MS = 5 * 60 * 1000;

function sameRecurringSeriesOccurrence(
  a: EventWithMeta,
  b: EventWithMeta,
): boolean {
  return (
    sameRecurringSeries(a, b) &&
    Math.abs(+new Date(a.starts_at) - +new Date(b.starts_at)) <=
      SERIES_OCCURRENCE_TOLERANCE_MS
  );
}

function sameEventVenue(a: EventWithMeta, b: EventWithMeta): boolean {
  if (
    a.venue_place_slug &&
    b.venue_place_slug
  ) {
    return a.venue_place_slug === b.venue_place_slug;
  }
  if (venuesMatch(a.venue_name, b.venue_name)) return true;
  const precise = new Set(["venue_match", "exact_address"]);
  return (
    precise.has(a.geo_confidence) &&
    precise.has(b.geo_confidence) &&
    haversineMeters(a.geom, b.geom) <= 50
  );
}

function editorialVerificationTime(event: EventWithMeta): number {
  // Live adapters stamp last_verified_at with fetch time. That proves the row
  // was retrieved, not that its title was changed by the publisher. Only an
  // editorially verified row may use this timestamp to settle a copy conflict.
  if (!event.is_verified || !event.last_verified_at) return 0;
  const value = +new Date(event.last_verified_at);
  return Number.isFinite(value) ? value : 0;
}

function publisherUpdateTime(event: EventWithMeta): number {
  if (!event.publisher_updated_at) return 0;
  const value = +new Date(event.publisher_updated_at);
  return Number.isFinite(value) ? value : 0;
}

function isDirectDfpEventUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "downtownfrederick.org" &&
      url.pathname.startsWith("/vm-event/")
    );
  } catch {
    return false;
  }
}

function recurringSeriesDetail(title: string): string | null {
  // The last strong separator names the changing occurrence detail. This
  // keeps "Opening Night" as series copy while extracting the actual act
  // from "Alive @ Five: Opening Night · Old Act".
  const strong = title.match(/.*(?:\s+[·|–—]\s*|\s+-\s+)(.+)$/u);
  if (strong?.[1]?.trim()) return strong[1].trim();
  const colon = title.match(/.*:\s*(.+)$/u);
  return colon?.[1]?.trim() || null;
}

const normPerformer = (value: string) =>
  normLoose(value.replaceAll("&", " and "));

function correctRecurringDescription(
  current: EventWithMeta,
  correction: EventWithMeta,
): string {
  const oldDetail = recurringSeriesDetail(current.title);
  const newDetail = recurringSeriesDetail(correction.title);
  if (
    oldDetail &&
    newDetail &&
    normPerformer(oldDetail) !== normPerformer(newDetail) &&
    normPerformer(current.description).includes(normPerformer(oldDetail))
  ) {
    const escaped = oldDetail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exact = new RegExp(escaped, "gi");
    if (exact.test(current.description)) {
      return current.description.replace(exact, newDetail);
    }

    // The description may spell "&" as "and" or vary punctuation. Remove
    // only the sentence that names the stale performer, then rebuild that one
    // factual sentence from the current structured title.
    const remaining = current.description
      .split(/(?<=[.!?])\s+/u)
      .filter(
        (sentence) =>
          !normPerformer(sentence).includes(normPerformer(oldDetail)),
      )
      .join(" ")
      .trim();
    const series = recurringSeriesLabel(current.title) ?? "this event";
    const lead = `${newDetail} headlines ${series}.`;
    return remaining ? `${lead} ${remaining}` : lead;
  }
  // A publisher excerpt can still contain stale prose even when its title is
  // current. Only use it when Radius has no description of its own.
  return current.description || correction.description;
}

/**
 * Apply a newer first-party structured correction to the matching curated
 * occurrence without throwing away the richer Radius record around it.
 *
 * This is deliberately narrow. Today the only qualifying source is DFP's
 * WordPress/Vibemap registry because it supplies a real publisher modification
 * time. A fresh fetch timestamp is never enough. We require an exact occurrence
 * match or one unambiguous series occurrence on the same local day.
 */
export function applyOfficialPublisherUpdates(
  curated: EventWithMeta[],
  live: EventWithMeta[],
): EventWithMeta[] {
  return curated.map((current) => {
    const currentEvidence = editorialVerificationTime(current);
    const eligible = live.filter(
      (candidate) =>
        candidate.source === "dfp" &&
        current.source === "dfp" &&
        !candidate.is_verified &&
        publisherUpdateTime(candidate) > currentEvidence,
    );
    const exact = eligible.filter(
      (candidate) =>
        (Boolean(current.source_url) &&
          isDirectDfpEventUrl(current.source_url) &&
          current.source_url === candidate.source_url &&
          sameRecurringSeries(current, candidate)) ||
        (sameEventVenue(current, candidate) &&
          sameRecurringSeriesOccurrence(current, candidate)),
    );
    const sameSeriesDay = eligible.filter(
      (candidate) =>
        sameRecurringSeries(current, candidate) &&
        easternDayKey(new Date(current.starts_at)) ===
          easternDayKey(new Date(candidate.starts_at)),
    );
    const curatedSeriesDay = curated.filter(
      (candidate) =>
        candidate.source === "dfp" &&
        sameRecurringSeries(current, candidate) &&
        easternDayKey(new Date(current.starts_at)) ===
          easternDayKey(new Date(candidate.starts_at)),
    );
    // A single structured occurrence on the same local day can safely carry
    // a last-minute time or venue move. Multiple sessions are ambiguous and
    // require an exact URL/venue/time match or human review.
    const correction = (exact.length > 0
      ? exact
      : sameSeriesDay.length === 1 && curatedSeriesDay.length === 1
        ? sameSeriesDay
        : [])
      .sort((a, b) => publisherUpdateTime(b) - publisherUpdateTime(a))[0];

    if (!correction) return current;
    const venueMoved = !venuesMatch(current.venue_name, correction.venue_name);
    const canApplyVenue =
      !venueMoved || correction.geo_confidence === "exact_address";

    return {
      ...current,
      // These are factual fields owned by the organizer. Keep Radius-only
      // admission notes, recurrence copy, venue relationship, and imagery.
      title: correction.title,
      description: correctRecurringDescription(current, correction),
      starts_at: correction.starts_at,
      ends_at: correction.ends_at,
      status: correction.status,
      venue_name: canApplyVenue ? correction.venue_name : current.venue_name,
      address:
        canApplyVenue && correction.address
          ? correction.address
          : current.address,
      venue_place_slug:
        canApplyVenue && venueMoved ? undefined : current.venue_place_slug,
      geom:
        canApplyVenue && correction.geo_confidence === "exact_address"
          ? correction.geom
          : current.geom,
      organizer: correction.organizer || current.organizer,
      source_url: current.source_url ?? correction.source_url,
      publisher_updated_at: correction.publisher_updated_at,
      last_verified_at: correction.publisher_updated_at ?? current.last_verified_at,
      geo_confidence:
        canApplyVenue && correction.geo_confidence === "exact_address"
          ? correction.geo_confidence
          : current.geo_confidence,
    };
  });
}

/**
 * Drops live or county-feed events that duplicate a curated event. The
 * curated row wins because live-feed last_verified_at is fetch time, not a
 * publisher-change timestamp. A live event is a duplicate when:
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
      let duplicate =
        venuesMatch(c.venue_name, l.venue_name) && titlesMatch(c.title, l.title);
      // Same recurring program, same place, same clock. The performer suffix
      // may conflict because one source has not picked up a lineup change.
      duplicate ||=
        sameEventVenue(c, l) && sameRecurringSeriesOccurrence(c, l);
      // Path 2: strong title match — venue divergence is OK because
      // municipal feeds use generic placeholders ("Frederick County
      // Calendar") that won't match the curated specific venue.
      duplicate ||= titlesMatchStrong(c.title, l.title);
      return duplicate;
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
 *   - Editorial verification over live-feed retrieval
 *   - Newer editorial verification evidence next
 *   - Then hero_image > no hero_image (richer card)
 *   - Then description > no description
 *   - Otherwise keep the earlier entry (stable)
 */
export function dedupeCuratedClusters(events: EventWithMeta[]): EventWithMeta[] {
  const out: EventWithMeta[] = [];
  for (const e of events) {
    const t = +new Date(e.starts_at);
    const dupeIdx = out.findIndex((kept) => {
      const kt = +new Date(kept.starts_at);
      if (Math.abs(kt - t) > 60 * 60 * 1000) return false;
      return (
        titlesMatchStrong(kept.title, e.title) ||
        (sameEventVenue(kept, e) &&
          sameRecurringSeriesOccurrence(kept, e))
      );
    });
    if (dupeIdx === -1) {
      out.push(e);
      continue;
    }
    // Human/editor verification outranks live-feed fetch freshness. A live
    // adapter's timestamp only says when we retrieved the row and must never
    // undo a confirmed last-minute act, cancellation, or time correction.
    const kept = out[dupeIdx];
    if (Boolean(e.is_verified) !== Boolean(kept.is_verified)) {
      if (e.is_verified) out[dupeIdx] = e;
      continue;
    }
    // Between two editorially verified rows, the newer editorial check wins.
    const challengerVerified = editorialVerificationTime(e);
    const keptVerified = editorialVerificationTime(kept);
    if (challengerVerified !== keptVerified) {
      if (challengerVerified > keptVerified) out[dupeIdx] = e;
      continue;
    }
    // With equal/unknown verification evidence, pick the richer record.
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
        isUpcomingEvent(x, now)
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
  // Current events plus starts in the rolling 24h window. Using the shared
  // visibility rule matters at the boundary: a start-only 10 AM event gets
  // its assumed runtime instead of disappearing at 10:00. Absolute-time
  // arithmetic keeps the window DST- and timezone-safe.
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return EVENTS
    .filter((e) => {
      const s = new Date(e.starts_at);
      return Number.isFinite(s.getTime()) && s < end && isUpcomingEvent(e, now);
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
    .filter((e) => e.municipality === slug && (!futureOnly || isUpcomingEvent(e, now)))
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
    .map((e) => decorate(e));
}

export function allUpcoming(now: Date = new Date(), limit?: number): EventWithMeta[] {
  const out = EVENTS
    .filter((e) => isUpcomingEvent(e, now))
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
    .filter((e) => isUpcomingEvent(e, now))
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
    .filter((e) => e.municipality !== slug && isUpcomingEvent(e, now))
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
