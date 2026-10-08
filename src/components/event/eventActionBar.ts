import type { CSSProperties } from "react";
import type { EventAttendanceMode } from "@/lib/events/attendance";
import { easternDayKey, easternWallToUtcISO } from "@/lib/tz";

export type EventMobilePrimaryAction =
  | "directions"
  | "tickets"
  | "online"
  | "calendar";

const HOUR_MS = 3_600_000;
/** Directions lead from this long before a timed start. */
export const DIRECTIONS_LEAD_MS = 3 * HOUR_MS;
/** A timed event with no usable end gets this runtime, as elsewhere. */
const UNKNOWN_END_RUNTIME_MS = 3 * HOUR_MS;
/** Longer than this, a timed listing is a multi-day run, not one outing. */
const SINGLE_OUTING_MAX_MS = 18 * HOUR_MS;
/** On each day of a multi-day or all-day event, Directions lead from 7 AM. */
const EVENT_DAY_OPENS_HOUR = 7;

const EASTERN_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function easternClock(at: Date): { hour: number; minute: number } {
  const parts = Object.fromEntries(
    EASTERN_CLOCK.formatToParts(at).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return { hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

/** The instant an Eastern wall clock reads `hour:minute` on `dayKey`. */
function easternInstant(dayKey: string, hour: number, minute = 0): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return Date.parse(easternWallToUtcISO(year, month, day, hour, minute));
}

export type EventDirectionsWindowInput = {
  now: Date;
  startsAt: string;
  /** The stated end, or null/undefined when the publisher gave none. */
  endsAt?: string | null;
  /** All-day rows and date-only anchors have no start clock to count from. */
  isAllDay?: boolean;
};

/**
 * Is `now` the stretch of time when someone is on their way to this event?
 *
 * - A timed outing (up to 18 hours long): from 3 hours before the start until
 *   the end. Without a usable end it gets a 3-hour runtime.
 * - A multi-day or all-day event: on each event day, from 7 AM until the
 *   event's closing clock time (until midnight when it closes after midnight
 *   or is all day), and never past the final end. On the first day the window
 *   also waits until 3 hours before the start.
 *
 * Every clock here is Eastern, because that is the clock the event keeps.
 */
export function isEventDirectionsWindow({
  now,
  startsAt,
  endsAt,
  isAllDay = false,
}: EventDirectionsWindowInput): boolean {
  const nowMs = now.getTime();
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(startMs)) return false;
  const statedEndMs = endsAt ? Date.parse(endsAt) : Number.NaN;
  const hasEnd = Number.isFinite(statedEndMs) && statedEndMs > startMs;
  const multiDay =
    isAllDay || (hasEnd && statedEndMs - startMs > SINGLE_OUTING_MAX_MS);

  if (!multiDay) {
    const endMs = hasEnd ? statedEndMs : startMs + UNKNOWN_END_RUNTIME_MS;
    return nowMs >= startMs - DIRECTIONS_LEAD_MS && nowMs < endMs;
  }

  // An all-day end is exclusive (midnight after the last day). A legacy row
  // without one covers only its start day.
  const endMs = hasEnd
    ? statedEndMs
    : easternInstant(easternDayKey(new Date(startMs)), 24);
  if (nowMs >= endMs) return false;
  const today = easternDayKey(now);
  const firstDay = easternDayKey(new Date(startMs));
  const lastDay = easternDayKey(new Date(endMs - 1));
  if (today < firstDay || today > lastDay) return false;

  let opensMs = easternInstant(today, EVENT_DAY_OPENS_HOUR);
  if (today === firstDay) {
    opensMs = Math.max(opensMs, startMs - DIRECTIONS_LEAD_MS);
  }
  let closesMs = endMs;
  if (today !== lastDay) {
    const close = easternClock(new Date(endMs));
    const closesAfterOpening =
      close.hour * 60 + close.minute > EVENT_DAY_OPENS_HOUR * 60;
    closesMs = closesAfterOpening
      ? easternInstant(today, close.hour, close.minute)
      : easternInstant(today, 24);
  }
  return nowMs >= opensMs && nowMs < closesMs;
}

/**
 * The one filled action in an upcoming event's action bar.
 *
 * On the way to an in-person event at a precisely located venue, Directions
 * lead: from 3 hours before a timed start until its end, and from 7 AM on each
 * day of a multi-day or all-day event (see isEventDirectionsWindow). Tickets
 * stay available as a secondary action during that stretch. The rule never
 * applies to online, hybrid or area-only events, or to a cancelled or
 * postponed one, whose bars are built separately by the page.
 *
 * Otherwise Tickets lead when the event sells them. An online or hybrid event
 * without tickets leads with its online details. Every other event, including
 * an in-person event with no tickets, leads with Add to calendar.
 *
 * Add to calendar used to go quiet whenever `eventOnlineActionUrl` found a
 * URL. That helper falls back to the event's source page, so nearly every
 * in-person event without tickets rendered a bar with no filled primary at
 * all (October 2026 UI audit). Deciding all of them from this one rule keeps
 * exactly one primary on every event page.
 */
export function eventMobilePrimaryAction({
  ticketUrl,
  attendance,
  onlineActionUrl,
  now,
  startsAt,
  endsAt,
  isAllDay,
  hasDirections = false,
  status = "scheduled",
}: {
  ticketUrl?: string | null;
  attendance: EventAttendanceMode;
  onlineActionUrl?: string | null;
  /** The request clock. Without it the Directions window is never open. */
  now?: Date;
  startsAt?: string;
  endsAt?: string | null;
  isAllDay?: boolean;
  /** True only for a precise venue the page can route to. */
  hasDirections?: boolean;
  status?: "scheduled" | "cancelled" | "postponed";
}): EventMobilePrimaryAction {
  if (
    hasDirections &&
    attendance === "physical" &&
    status === "scheduled" &&
    now &&
    startsAt &&
    isEventDirectionsWindow({ now, startsAt, endsAt, isAllDay })
  ) {
    return "directions";
  }
  if (ticketUrl) return "tickets";
  if (attendance !== "physical" && onlineActionUrl) return "online";
  return "calendar";
}

/**
 * Desktop action row chrome. From 1024px the page's actions sit in one row
 * instead of a grid of full-width slabs: the primary is a single 48px filled
 * button sized to its label, and every other action is a 44px text button.
 * Shared so the page's links and EventCalendarButton read as one row.
 */
export function eventDesktopActionClass(primary: boolean): string {
  return primary
    ? "tactile-glow-brand inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--app-radius-md)] px-6 text-body font-semibold transition"
    : "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--app-radius-md)] px-3 text-body font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]";
}

export function eventDesktopActionStyle(primary: boolean): CSSProperties {
  return primary
    ? { background: "var(--app-brand-press)", color: "var(--app-on-brand)" }
    : { color: "var(--app-brand-press)" };
}
