import { EVENTS, EVENT_BY_SLUG, type Event } from "@/data/events";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { PLACE_BY_SLUG } from "@/data/places";
import { haversineMeters, type LngLat } from "@/lib/geo";

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

export function getEventBySlug(slug: string): (EventWithMeta & { venue_place_name?: string }) | null {
  const e = EVENT_BY_SLUG[slug];
  if (!e) return null;
  const venue = e.venue_place_slug ? PLACE_BY_SLUG[e.venue_place_slug] : null;
  return {
    ...decorate(e),
    venue_place_name: venue?.name,
  };
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
