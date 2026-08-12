import { isEventLiveNow } from "@/lib/eventWhenLabel";

export const MAP_STARTING_SOON_MS = 90 * 60_000;

type MapEventTiming = {
  starts_at: string;
  ends_at?: string | null;
  is_all_day?: boolean;
};

/**
 * Membership for the map's "Now" lens: an event with a trustworthy window
 * that is genuinely underway, or any timed event starting in the next 90
 * minutes. The second case is a future listing, not a live claim.
 */
export function eventMatchesMapNowWindow(
  event: MapEventTiming,
  now: Date,
): boolean {
  if (event.is_all_day) return false;
  const nowMs = now.getTime();
  const startMs = Date.parse(event.starts_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(startMs)) return false;
  if (isEventLiveNow(event, now)) return true;
  return startMs >= nowMs && startMs <= nowMs + MAP_STARTING_SOON_MS;
}
