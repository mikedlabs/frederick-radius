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
