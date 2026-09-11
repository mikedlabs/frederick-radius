import { isEventLiveNow } from "@/lib/eventWhenLabel";

type HeadlinerTiming = {
  starts_at: string;
  ends_at?: string;
  is_all_day?: boolean;
};

const PROMOTION_WINDOW_MS = 4 * 60 * 60 * 1000;
const MORNING_END_HOUR = 12;
const EVENING_START_HOUR = 17;

function easternHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  );
}

/**
 * A large Today headline has to be useful at the moment it appears.
 *
 * All-day and live events qualify. A future event qualifies only when it is
 * within four hours. The explicit morning guard keeps an evening event from
 * taking over the first screen at breakfast just because it is today's best
 * draw; it remains visible as a compact row in the event program instead.
 */
export function shouldPromoteTodayHeadliner(
  event: HeadlinerTiming,
  now: Date,
): boolean {
  const startsAt = new Date(event.starts_at);
  if (!Number.isFinite(startsAt.getTime())) return false;
  if (event.is_all_day) return true;
  if (isEventLiveNow(event, now)) return true;

  const currentHour = easternHour(now);
  if (
    currentHour < MORNING_END_HOUR &&
    easternHour(startsAt) >= EVENING_START_HOUR
  ) {
    return false;
  }

  const startsIn = startsAt.getTime() - now.getTime();
  return startsIn >= 0 && startsIn <= PROMOTION_WINDOW_MS;
}
