import { EVENTS as RAW_EVENTS, EVENT_BY_SLUG, type Event } from "@/data/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG, type Municipality } from "@/data/municipalities";
import { PLACE_BY_SLUG } from "@/data/places";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { isKnownClosed } from "@/lib/integrations/closures";

/**
 * Systemic guard: never surface an event whose venue is a known-closed
 * business (VOLT, Idiom, etc.). Seed events go stale when a venue shuts;
 * filtering at the source means every loader function is protected without
 * having to remember the filter in each one.
 */
const EVENTS = RAW_EVENTS.filter((e) => !isKnownClosed(e.venue_name));

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

function decorate(e: Event, origin?: LngLat): EventWithMeta {
  return {
    ...e,
    distance_m: origin ? haversineMeters(origin, e.geom) : undefined,
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
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

/**
 * Drops live or county-feed events that duplicate a curated event.
 * Curated always wins (P0-4). A live event is a duplicate when it is at
 * the same venue, starts within 60 minutes, and the titles match by
 * containment or a six character common run. Conservative on purpose:
 * all three signals must agree so distinct events are never merged.
 */
export function dedupeLiveAgainstCurated(
  live: EventWithMeta[],
  curated: EventWithMeta[],
): EventWithMeta[] {
  return live.filter((l) => {
    const lt = +new Date(l.starts_at);
    return !curated.some((c) => {
      const within = Math.abs(+new Date(c.starts_at) - lt) <= 60 * 60 * 1000;
      return (
        within &&
        venuesMatch(c.venue_name, l.venue_name) &&
        titlesMatch(c.title, l.title)
      );
    });
  });
}

export function getEventBySlug(slug: string): (EventWithMeta & { venue_place_name?: string }) | null {
  const e = EVENT_BY_SLUG[slug];
  if (!e) return null;
  const venue = e.venue_place_slug ? PLACE_BY_SLUG[e.venue_place_slug] : null;
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
