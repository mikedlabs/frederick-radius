import type { Event } from "@/data/events";
import { eventDateBlock } from "@/lib/events/format";
import { eventAttendanceLabel, hasPhysicalAttendance } from "@/lib/events/attendance";
import { eventHasTrustworthyEnd, isDateOnlyEventAnchor, startedEventTimingDisclosure } from "@/lib/eventWhenLabel";
import { isRangeListing } from "@/lib/eventHorizon";

/** Comparable facts shared by the list, its sheet, and the full event page. */
export function eventDecisionLocation(event: Pick<Event, "title" | "venue_name" | "address" | "attendance_mode"> & {
  municipality_name?: string;
}): string {
  const venue = eventAttendanceLabel(event);
  if (!hasPhysicalAttendance(event)) return venue;
  const town = event.municipality_name?.trim();
  if (!town || venue.toLocaleLowerCase() === town.toLocaleLowerCase()) return venue;
  return venue ? `${venue} · ${town}` : town;
}

export function eventDecisionTime(event: Event, now?: Date): string {
  const date = eventDateBlock(event);
  if (now && (event.status ?? "scheduled") === "scheduled") {
    const disclosure = startedEventTimingDisclosure(event, now);
    if (disclosure) return disclosure;
  }
  if (event.is_all_day || isDateOnlyEventAnchor(event) || isRangeListing(event)) return date.time;
  if (!eventHasTrustworthyEnd(event)) return `${date.time} · end time not listed`;
  const end = new Date(event.ends_at);
  const start = new Date(event.starts_at);
  if (end.getTime() - start.getTime() > 18 * 60 * 60 * 1000) {
    return `through ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(end)} · check daily hours`;
  }
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true,
  });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
  const endDay = day.format(start) === day.format(end)
    ? ""
    : `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(end)} `;
  return `${date.time}–${endDay}${clock.format(end)}`;
}

const EASTERN_MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});

/**
 * The clock a list row prints: when it starts, in as few words as the facts
 * allow. A row has one meta line, so the cautions an upcoming row used to
 * append ("end time not listed", "check daily hours") live in the event sheet
 * and on the detail page through `eventTimeCaution`, where they read as
 * sentences. The one caution a row keeps is for an event that has already
 * begun without a usable end: whether it is still going is the decision, so
 * the row says it started and that its end is unknown.
 */
export function eventRowTime(event: Event, now?: Date): string {
  const date = eventDateBlock(event);
  if (now && (event.status ?? "scheduled") === "scheduled") {
    const disclosure = startedEventTimingDisclosure(event, now);
    if (disclosure) return disclosure;
  }
  if (event.is_all_day || isDateOnlyEventAnchor(event) || isRangeListing(event)) {
    return date.time;
  }
  const start = Date.parse(event.starts_at);
  if (
    eventHasTrustworthyEnd(event) &&
    Date.parse(event.ends_at) - start > 18 * 60 * 60 * 1000
  ) {
    return `${date.time} through ${EASTERN_MONTH_DAY.format(new Date(event.ends_at))}`;
  }
  return date.time;
}

/** Never turn an all-day/date-anchor clock into an attendance appointment. */
export function eventTimeCaution(event: Event): string | null {
  if (isDateOnlyEventAnchor(event)) return "The publisher has not listed a start time. Check the event page before making plans.";
  if (event.is_all_day) return "Listed as all day. Check the event page for daily opening or admission hours.";
  if (isRangeListing(event) || Date.parse(event.ends_at) - Date.parse(event.starts_at) > 18 * 60 * 60 * 1000) return "This listing spans several days. Check the event page for individual dates and opening hours.";
  if (!eventHasTrustworthyEnd(event)) return "The publisher has not listed an end time.";
  return null;
}
