import { hasRecommendationAttendance, type EventAttendanceInput } from "@/lib/events/attendance";
import type { Horizon } from "@/lib/eventHorizon";
import { easternDayKey } from "@/lib/tz";
import type {
  EventSortKey,
  ViewKey,
} from "@/components/event/EventsBoardDock";

/**
 * The default discovery view should prove there is something worth browsing
 * before asking for an interest. Alternate views, explicit sorts, and empty
 * crowd sets keep the interest rail in its conventional pre-results position.
 */
export function primaryLeadPrecedesInterestRail({
  view,
  sort,
  resultCount,
  horizonCount,
}: {
  view: ViewKey;
  sort: EventSortKey;
  resultCount: number;
  horizonCount: number;
}): boolean {
  return (
    view === "list" &&
    sort === "recommended" &&
    resultCount > 0 &&
    horizonCount > 0
  );
}

/** Only the immediate horizon earns the full poster treatment. */
export function horizonLeadVariant(
  groupIndex: number,
): "feature" | "glance" {
  return groupIndex === 0 ? "feature" : "glance";
}

/**
 * Whether a row in a horizon group prints its day line. "Happening now" and
 * "Today" already state the day, so a row that starts today drops the
 * repeated date and its time stands alone. Every other group spans several
 * days ("Later this week", "This weekend", "Coming up") and keeps the date on
 * every row, as does any row in a today group that started on another day.
 */
export function rowShowsDate(
  horizon: Horizon,
  event: { starts_at: string },
  todayKey: string,
): boolean {
  if (horizon !== "live" && horizon !== "today") return true;
  const start = new Date(event.starts_at);
  if (Number.isNaN(+start)) return true;
  return easternDayKey(start) !== todayKey;
}

/** Promotion never removes an ambiguous listing. Alternate sorts retain their
 * original first-row treatment; only Recommended requires attendance evidence.
 * Remove by array index so another occurrence with the same slug survives. */
export function splitHorizonLead<T extends EventAttendanceInput>(
  events: readonly T[],
  sort: EventSortKey,
): { lead: T | null; rest: T[] } {
  const index = sort === "recommended"
    ? events.findIndex(hasRecommendationAttendance)
    : events.length > 0 ? 0 : -1;
  return index < 0
    ? { lead: null, rest: [...events] }
    : { lead: events[index], rest: events.filter((_, position) => position !== index) };
}
