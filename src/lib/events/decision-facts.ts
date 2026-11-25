import type { Event } from "@/data/events";
import { publishedEventTime } from "./published-time";
import { eventDateBlock } from "@/lib/events/format";
import { eventAttendanceLabel, hasPhysicalAttendance } from "@/lib/events/attendance";
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
  const precision = publishedEventTime(event);
  if (precision === "date" || isRangeListing(event)) return date.time;
  if (precision === "start") {
    if (now && (event.status ?? "scheduled") === "scheduled" && Date.parse(event.starts_at) <= now.getTime()) {
      return `Started at ${date.time} · end time unavailable`;
    }
    return `${date.time} · end time not listed`;
  }
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

/** Never turn an all-day/date-anchor clock into an attendance appointment. */
export function eventTimeCaution(event: Event): string | null {
  if (event.is_all_day) return "Listed as all day. Check the event page for daily opening or admission hours.";
  if (publishedEventTime(event) === "date") return "The publisher has not listed a start time. Check the event page before making plans.";
  if (isRangeListing(event) || Date.parse(event.ends_at) - Date.parse(event.starts_at) > 18 * 60 * 60 * 1000) return "This listing spans several days. Check the event page for individual dates and opening hours.";
  if (publishedEventTime(event) === "start") return "The publisher has not listed an end time.";
  return null;
}
