import type { Event } from "@/data/events";
import { isRangeListing } from "@/lib/eventHorizon";

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
  // Same-day must be judged on the EASTERN calendar day, not toDateString()
  // (server-local = UTC in production): a 8-10 PM ET event crosses UTC
  // midnight and rendered as the two-day range "Tue, Jul 7 – Tue, Jul 7".
  // en-CA prints YYYY-MM-DD, a ready-made day key.
  const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const sameDay = dayKeyFmt.format(start) === dayKeyFmt.format(end);
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
  // All-day rows (and zero-duration rows, which carry no real clock) get an
  // honest "All day" instead of a bogus midnight/zero time range — the same
  // convention eventDateBlock uses below.
  if (e.is_all_day || e.starts_at === e.ends_at) {
    return sameDay
      ? `${dateFmt.format(start)} · All day`
      : `${dateFmt.format(start)} – ${dateFmt.format(end)}`;
  }
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
    //
    // Date-RANGE listings (isRangeListing: a months-long exhibit, a series a
    // feed flattens to one first-day → last-day window) carry no real clock
    // either: starts_at is a noon ANCHOR on the range's first day, so
    // formatting it printed "12:00 PM" beside a date that could be months
    // old. Print the honest range end instead — "Thu JAN 29 · through Jul
    // 31" reads as what it is, an ongoing listing, not a curtain time.
    time: e.is_all_day
      ? "All day"
      : isRangeListing(e)
        ? `through ${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(e.ends_at))}`
        : new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }).format(start),
  };
}
