import type { Event } from "@/data/events";

/**
 * Pure event date/time formatters — deliberately DATA-FREE.
 *
 * These used to live in src/lib/loaders/events.ts, which statically imports
 * clientPlaceBySlug from the places-client dataset. Any "use client" component
 * importing a VALUE from that loader (EventCard did, for eventDateBlock)
 * dragged the entire 1.8 MB places-client.json into its client bundle — the
 * same import-chain leak AppMap.tsx documents guarding against with type-only
 * imports. Formatters live here so client components can share them at zero
 * data cost; the loader re-exports them for its existing server callers.
 *
 * Rule: nothing in this module may import from src/lib/loaders/* or src/data/*
 * except types.
 */

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
    // All-day rows carry no real clock — a formatted starts_at would print a
    // bogus "12:00 AM" (the guards downstream only test truthiness, so they
    // never caught it). Surface "All day" so every card variant reads right.
    time: e.is_all_day
      ? "All day"
      : new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(start),
  };
}
