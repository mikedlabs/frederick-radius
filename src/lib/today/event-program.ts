import type { EventWithMeta } from "@/lib/loaders/events";
import { isUtilityEvent } from "@/lib/event-kind";
import { isEventToday, isEventEnded } from "@/lib/eventWhenLabel";
import { compareForLead } from "@/lib/events/lead-rank";
import { isStrongTodayEvent } from "@/lib/today-events";
import { splitTonightFeature, withoutTodayFeature } from "./tonight";

/** The one today-program derivation, read by the What's-on program for both
 *  its feature and remaining rows. Keeping those decisions together means the
 *  selected feature can never be repeated in the timeline below it. */
export function deriveTodayProgram(publicEvents: readonly EventWithMeta[], now: Date) {
  const todayAll = publicEvents
    .filter((e) => isEventToday(e.starts_at, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  // Time-honesty partition (the 7:55 PM audit render led with six ENDED 2-4 PM
  // library crafts while a live Keys game sat ninth): the rail carries only
  // what's live or still ahead; finished draws demote to a quiet "Earlier
  // today" line list, and finished civic rows drop entirely (a meeting that
  // ended has no evening value). Grouping stays by start-day; the floor is
  // isEventEnded's real end time.
  const ended = todayAll.filter((e) => isEventEnded(e, now));
  const ahead = todayAll.filter((e) => !isEventEnded(e, now));
  // The headline treatment is for DRAWS only. Routine recurring programming
  // (storytime, ESL class, tech help — the standing library calendar) joins
  // civic business in the quiet program rows, ordered by start time, so the
  // hierarchy never flattens.
  const todaysEvents = ahead
    .filter((event) => isStrongTodayEvent(event, now))
    .sort(compareForLead);
  const strongEventKeys = new Set(
    todaysEvents.map((event) => `${event.slug}|${event.starts_at}`),
  );
  // Public rows outside prime eligibility stay in the quiet chronological
  // program. No source record is removed from the complete calendar.
  const alsoToday = ahead.filter(
    (event) => !strongEventKeys.has(`${event.slug}|${event.starts_at}`),
  );
  const earlierToday = ended.filter((e) => !isUtilityEvent(e));
  // The selected lead renders exactly once (as the page headliner). Duplicate
  // feed occurrences are removed from the compact program below instead of
  // removing the lead.
  const { feature, remaining: upcomingRest } = splitTonightFeature(now, todaysEvents);
  return {
    todayAll,
    ahead,
    feature,
    upcomingRest,
    remainingAlsoToday: withoutTodayFeature(feature, alsoToday),
    remainingEarlierToday: withoutTodayFeature(feature, earlierToday),
  };
}
