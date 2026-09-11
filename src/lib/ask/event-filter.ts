import type { Event } from "@/data/events";
import type { AskIntent } from "@/lib/ask/intent";
import { eventOccursOnDate } from "@/lib/ask/time";
import { isRangeListing } from "@/lib/eventHorizon";
import { easternDayKey, easternParts, easternWallToUtcISO } from "@/lib/tz";

const HOUR_MS = 60 * 60 * 1_000;
const MAX_ORDINARY_TONIGHT_EVENT_DURATION_MS = 8 * HOUR_MS;
const MAX_NAMED_DAY_EVENT_DURATION_MS = 18 * HOUR_MS;
const LONG_DAY_EVENT_EVIDENCE_RE =
  /\b(?:street festival|festival|county fair|state fair|carnival|parade|heritage days?|railroad days?|community day|arts? walk|book festival|film festival|food festival|music festival|conference|convention|expo)\b/i;

type TonightEvent = Pick<Event, "starts_at" | "ends_at" | "is_all_day"> &
  Partial<Pick<Event, "title" | "description" | "category">>;

/**
 * A long clock range is not automatically bad data. Frederick's flagship
 * one-day festivals can honestly run for ten hours, while an ordinary feed
 * row spanning breakfast through bedtime is usually a schedule container,
 * not a specific occurrence. Keep ordinary events tightly bounded and allow
 * longer one-day rows only when their own title/category/description says
 * they are a named day event. All-day and multi-day range rows never pass.
 */
function hasUsableTonightOccurrence(event: TonightEvent): boolean {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  if (event.is_all_day || isRangeListing(event)) return false;

  const duration = end.getTime() - start.getTime();
  if (duration <= 0 || duration > MAX_NAMED_DAY_EVENT_DURATION_MS) return false;
  if (duration <= MAX_ORDINARY_TONIGHT_EVENT_DURATION_MS) return true;

  return LONG_DAY_EVENT_EVIDENCE_RE.test(
    [event.title, event.category, event.description].filter(Boolean).join(" "),
  );
}

function isNamedLongDayEvent(event: TonightEvent): boolean {
  const duration = Date.parse(event.ends_at) - Date.parse(event.starts_at);
  return (
    duration > MAX_ORDINARY_TONIGHT_EVENT_DURATION_MS &&
    hasUsableTonightOccurrence(event)
  );
}

/**
 * A "tonight" result has to describe a real evening occurrence, not merely
 * a row whose broad start/end range happens to cover the current instant.
 *
 * Before 4 PM, keep events that begin at/after 4. Once an ordinary timed
 * event is genuinely underway it may also qualify when it carries into the
 * evening (for example, a 3 PM show still running at 6). All-day and
 * day-length rows are useful on Today, but they are not proof of something
 * a visitor can specifically do tonight.
 */
export function eventFitsTonightWindow(
  event: TonightEvent,
  now = new Date(),
): boolean {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  if (end <= now || !hasUsableTonightOccurrence(event)) return false;

  const today = easternParts(now);
  const eveningStart = new Date(easternWallToUtcISO(
    today.year,
    today.month,
    today.day,
    16,
    0,
  ));
  const beginsThisEvening =
    easternDayKey(start) === easternDayKey(now) && start >= eveningStart;
  const isLegitimatelyLiveIntoEvening =
    now >= eveningStart && start <= now && end > now;
  const namedDayEventRunsIntoEvening =
    isNamedLongDayEvent(event) &&
    easternDayKey(start) === easternDayKey(now) &&
    end > eveningStart;

  return (
    beginsThisEvening ||
    isLegitimatelyLiveIntoEvening ||
    namedDayEventRunsIntoEvening
  );
}

function isExplicitOvernightTonight(
  start: Date,
  requested: Date,
  now: Date,
): boolean {
  const nowParts = easternParts(now);
  const requestedParts = easternParts(requested);
  const startParts = easternParts(start);
  return (
    requestedParts.hour < 6 &&
    easternDayKey(requested) !== easternDayKey(now) &&
    easternDayKey(start) === easternDayKey(requested) &&
    startParts.hour < 6 &&
    requested.getTime() > new Date(easternWallToUtcISO(
      nowParts.year,
      nowParts.month,
      nowParts.day,
      16,
      0,
    )).getTime()
  );
}

export function eventFitsAskIntent(
  event: Event,
  intent: AskIntent,
  now = new Date(),
  query = "",
): boolean {
  if (intent.budget === "free" && !event.is_free) return false;
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;

  if (intent.timeNeed === "now") return start <= now && end > now;

  // Natural "tonight" parsing also resolves the current calendar date. The
  // semantic evening gate must win before the generic requested-date branch,
  // otherwise every daytime row on that date qualifies again.
  if (intent.timeNeed === "tonight") {
    if (intent.requestedDate && !eventOccursOnDate(event, intent.requestedDate)) return false;
    let explicitOvernight = false;
    if (intent.requestedDateTime) {
      const requested = new Date(intent.requestedDateTime);
      if (!Number.isFinite(requested.getTime())) return false;
      // Keep the same bounded clock window used for other dated event asks.
      // "At 7 tonight" must not broaden back into every evening event.
      if (
        end <= requested ||
        start.getTime() > requested.getTime() + 2 * 60 * 60 * 1_000
      ) {
        return false;
      }
      explicitOvernight = isExplicitOvernightTonight(start, requested, now);
    }
    // The overnight shortcut changes the civil date; it does not bypass the
    // same occurrence-quality gate used by the ordinary evening window.
    return hasUsableTonightOccurrence(event) && (
      explicitOvernight || eventFitsTonightWindow(event, now)
    );
  }

  if (intent.requestedDate) {
    if (!eventOccursOnDate(event, intent.requestedDate)) return false;
    // A months-long row can represent a weekly series with no occurrence
    // dates. It proves the series exists, not that it meets tomorrow. Its
    // actual opening day is still a valid date claim.
    if (isRangeListing(event) && easternDayKey(start) !== intent.requestedDate) return false;
    if (intent.requestedDateTime) {
      const requested = new Date(intent.requestedDateTime);
      // "Events at 7" includes something already running and events beginning
      // within the next two hours, but not an unrelated matinee or midnight row.
      return end > requested && start.getTime() <= requested.getTime() + 2 * 60 * 60 * 1_000;
    }
    if (/\b(?:night|evening)\b/i.test(query)) {
      return event.is_all_day === true || easternParts(start).hour >= 16;
    }
    return true;
  }

  if (!intent.timeNeed) return true;
  const currentKey = easternDayKey(now);
  const startKey = easternDayKey(start);
  const endKey = easternDayKey(end);
  const begins = easternParts(start);
  const runningToday = startKey <= currentKey && endKey >= currentKey && end > now;
  const unprovenRunningRange = isRangeListing(event) && startKey !== currentKey;
  if (unprovenRunningRange && ["today", "tonight", "morning", "afternoon"].includes(intent.timeNeed)) {
    return false;
  }
  if (intent.timeNeed === "today") return runningToday;
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
