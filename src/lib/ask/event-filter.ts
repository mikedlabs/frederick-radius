import type { Event } from "@/data/events";
import type { AskIntent } from "@/lib/ask/intent";
import { eventOccursOnDate } from "@/lib/ask/time";
import { easternDayKey, easternParts } from "@/lib/tz";

export function eventFitsAskIntent(event: Event, intent: AskIntent, now = new Date()): boolean {
  if (intent.budget === "free" && !event.is_free) return false;
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;

  if (intent.timeNeed === "now") return start <= now && end > now;

  if (intent.requestedDate) {
    if (!eventOccursOnDate(event, intent.requestedDate)) return false;
    if (intent.requestedDateTime) {
      const requested = new Date(intent.requestedDateTime);
      // "Events at 7" includes something already running and events beginning
      // within the next two hours, but not an unrelated matinee or midnight row.
      return end > requested && start.getTime() <= requested.getTime() + 2 * 60 * 60 * 1_000;
    }
    return true;
  }

  if (!intent.timeNeed) return true;
  const currentKey = easternDayKey(now);
  const startKey = easternDayKey(start);
  const endKey = easternDayKey(end);
  const begins = easternParts(start);
  const runningToday = startKey <= currentKey && endKey >= currentKey && end > now;
  if (intent.timeNeed === "today") return runningToday;
  if (intent.timeNeed === "tonight") {
    return runningToday && (begins.hour >= 16 || start <= now || event.is_all_day === true);
  }
  if (intent.timeNeed === "morning") {
    return startKey === currentKey && begins.hour < 12 && end > now;
  }
  if (intent.timeNeed === "afternoon") {
    return startKey === currentKey && begins.hour >= 12 && begins.hour < 17 && end > now;
  }
  if (intent.timeNeed === "tomorrow") return false; // requestedDate handles this branch.
  if (intent.timeNeed === "weekend") {
    const daysAway = Math.floor((start.getTime() - now.getTime()) / 86_400_000);
    return daysAway >= -1 && daysAway <= 8 && (begins.weekday === 0 || begins.weekday === 6);
  }
  return true;
}
