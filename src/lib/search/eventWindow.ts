import type { Event } from "@/data/events";
import { eventFitsAskIntent } from "@/lib/ask/event-filter";
import { parseAskIntent } from "@/lib/ask/intent";
import { parseAskDateTime } from "@/lib/ask/time";
import { buildHorizonBounds, isRangeListing } from "@/lib/eventHorizon";
import { isUpcomingEvent } from "@/lib/events/visible";
import { easternDayKey, easternParts } from "@/lib/tz";

export type SearchEventWindow = {
  label: string | null;
  date: string | null;
  freeOnly: boolean;
};

/** Search and Ask use the same occurrence checks. A date is a constraint,
 * not a relevance boost, and an old exact title is never an upcoming result. */
export function searchEventWindow(query: string, now = new Date()) {
  const intent = parseAskIntent(query, now);
  const parsed = parseAskDateTime(query, now);
  const nextWeekend = /\bnext\s+weekend\b/i.test(query);
  const weekend = intent.timeNeed === "weekend";
  const clock = easternParts(now);
  const weekendBounds = weekend
    ? buildHorizonBounds(nextWeekend
      ? new Date(Date.UTC(clock.year, clock.month - 1, clock.day + 7, 12))
      : now)
    : null;
  const labels = {
    now: "Happening now", today: "Today", tonight: "Tonight", tomorrow: "Tomorrow",
    weekend: nextWeekend ? "Next weekend" : "This weekend",
    morning: "This morning", afternoon: "This afternoon",
  } as const;
  const meta: SearchEventWindow = {
    label: intent.timeNeed ? labels[intent.timeNeed] : parsed.dateLabel,
    date: intent.requestedDate,
    freeOnly: intent.budget === "free",
  };

  return {
    meta,
    matches(event: Event): boolean {
      if (!isUpcomingEvent(event, now) || parsed.invalidLocalTime) return false;
      if (intent.budget === "free" && event.is_free !== true) return false;
      if (weekendBounds) {
        const start = Date.parse(event.starts_at);
        const end = Date.parse(event.ends_at);
        // A broad season/series is not proof of a weekend occurrence.
        if (isRangeListing(event)) return false;
        return start < weekendBounds.weekendEnd &&
          end > Math.max(now.getTime(), weekendBounds.weekendStart);
      }
      // A calendar day can be implicit in a clock request. Reuse Ask's
      // bounded time checks rather than interpreting 7 PM in server time.
      if (intent.requestedDate || intent.timeNeed) {
        if (!eventFitsAskIntent(event, intent, now, query)) return false;
        // Ask's named-day check admits all-day rows in an evening query.
        // Search must not present an unknown evening occurrence as confirmed.
        if (/\b(?:night|evening)\b/i.test(query) && event.is_all_day) return false;
        if (intent.timeNeed === "today" && isRangeListing(event) &&
          easternDayKey(new Date(event.starts_at)) !== easternDayKey(now)) return false;
      }
      return true;
    },
  };
}
