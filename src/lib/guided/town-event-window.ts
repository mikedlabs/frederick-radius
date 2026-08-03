import { isUpcomingEvent } from "@/lib/events/visible";

const NEXT_SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type TownEventWindowRow = {
  starts_at: string;
  ends_at?: string | null;
  is_all_day?: boolean;
};

/**
 * The town picker uses a rolling seven-day look-ahead. This intentionally
 * differs from the Events board's editorial horizons, which split weekdays,
 * the weekend, and the following week into separate sections.
 */
export function isInNextSevenDayTownWindow(
  event: TownEventWindowRow,
  now: Date,
): boolean {
  const start = Date.parse(event.starts_at);
  return (
    Number.isFinite(start) &&
    start <= now.getTime() + NEXT_SEVEN_DAYS_MS &&
    isUpcomingEvent(event, now)
  );
}

/** A count of source-backed listings, not a claim that nothing else exists. */
export function townEventWindowLabel(count: number): string {
  if (count <= 0) return "Next 7 days · No events listed";
  return `Next 7 days · ${count} ${count === 1 ? "event" : "events"} listed`;
}
