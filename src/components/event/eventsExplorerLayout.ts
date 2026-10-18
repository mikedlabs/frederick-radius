import { hasRecommendationAttendance, type EventAttendanceInput } from "@/lib/events/attendance";
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
