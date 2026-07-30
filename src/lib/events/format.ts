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

const EASTERN_DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const EASTERN_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function easternClock(date: Date): {
  hour: number;
  minute: number;
  second: number;
} {
  const parts = EASTERN_CLOCK.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/**
 * Some public feeds use 11:59 PM as "we do not have an end time." Treating
 * that sentinel as a real clock range made a morning program look 15 hours
 * long and placed the same false precision in search results and JSON-LD.
 *
 * A genuine evening event ending near midnight remains intact. We only
 * withhold the end when it is on the same Eastern day, at 11:58 PM or later,
 * and at least ten hours after the start.
 */
export function eventHasTrustworthyEnd(
  e: Pick<Event, "starts_at" | "ends_at" | "is_all_day">,
): boolean {
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    return false;
  }
  if (e.is_all_day) return true;
  if (EASTERN_DAY_KEY.format(start) !== EASTERN_DAY_KEY.format(end)) {
    return true;
  }
  return !hasEndOfDaySentinel(e);
}

function hasEndOfDaySentinel(
  e: Pick<Event, "starts_at" | "ends_at" | "is_all_day">,
): boolean {
  if (e.is_all_day) return false;
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime() ||
    EASTERN_DAY_KEY.format(start) !== EASTERN_DAY_KEY.format(end)
  ) {
    return false;
  }
  const clock = easternClock(end);
  const looksLikeEndOfDay = clock.hour === 23 && clock.minute >= 58;
  const durationMs = end.getTime() - start.getTime();
  return looksLikeEndOfDay && durationMs >= 10 * 60 * 60 * 1000;
}

function isDateOnlyAnchor(e: Pick<Event, "starts_at" | "ends_at" | "is_all_day">) {
  if (!hasEndOfDaySentinel(e)) return false;
  const start = easternClock(new Date(e.starts_at));
  return start.hour === 12 && start.minute === 0 && start.second === 0;
}

export function formatEventWhen(e: Event): string {
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  // Same-day must be judged on the EASTERN calendar day, not toDateString()
  // (server-local = UTC in production): a 8-10 PM ET event crosses UTC
  // midnight and rendered as the two-day range "Tue, Jul 7 – Tue, Jul 7".
  // en-CA prints YYYY-MM-DD, a ready-made day key.
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
  // Only an explicit all-day flag earns "All day." Some feeds preserve a real
  // start clock but have no duration, represented as ends_at === starts_at.
  // Calling a 6 PM artist talk "All day" is worse than withholding its unknown
  // end, so zero-duration rows print the known start time only.
  if (e.is_all_day) {
    // RFC 5545 date-only DTEND is exclusive. Display the final INCLUDED
    // instant/day: [Jul 7, Jul 8) is one all-day event on Jul 7, while
    // [Jul 7, Jul 10) runs through Jul 9.
    const displayEnd =
      Number.isFinite(end.getTime()) && end.getTime() > start.getTime()
        ? new Date(end.getTime() - 1)
        : start;
    const sameDay =
      EASTERN_DAY_KEY.format(start) === EASTERN_DAY_KEY.format(displayEnd);
    return sameDay
      ? `${dateFmt.format(start)} · All day`
      : `${dateFmt.format(start)} – ${dateFmt.format(displayEnd)}`;
  }
  const sameDay = EASTERN_DAY_KEY.format(start) === EASTERN_DAY_KEY.format(end);
  if (isDateOnlyAnchor(e)) {
    return dateFmt.format(start);
  }
  if (e.starts_at === e.ends_at || !eventHasTrustworthyEnd(e)) {
    return `${dateFmt.format(start)} · ${timeFmt.format(start)}`;
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
      : isDateOnlyAnchor(e)
        ? "Time not listed"
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
