/**
 * Feed events that are not events.
 *
 * A venue publishing its open-hours as recurring calendar entries is a
 * status, not an event ("True Standard Distilling - Tasting Room Open"
 * fifteen times). Routine recurring municipal fitness classes and
 * council work sessions are operational schedule, not things to attend.
 *
 * Conservative by design. Hiding a real event is worse than letting a
 * little noise through, so:
 *  - the venue-status rule only fires when an "open" status is the END
 *    of the title (a terminal status), never when "open" is mid-title
 *    ("Tasting Room Open House with Live Music" stays, "Galleries Open
 *    Late for First Saturday" stays);
 *  - the space list is limited to drink-venue rooms, not generic
 *    "gallery/museum/park" which appear in countless real event titles;
 *  - the routine-class rule only applies where the caller already knows
 *    the entry recurs, so a one-off "Sunset Yoga fundraiser" still shows.
 *
 * Pure and unit-tested. Feed seams apply it behind a flag, so default
 * behavior is unchanged until enabled.
 */

// Drink-venue rooms whose "<room> ... Open" title is a status line.
const VENUE_STATUS = /\b(tasting room|tap ?room|cellar door)\b[^.!?]*\bopen\b\s*$/i;

// Unambiguous operational-hours phrasing (not event language).
const OPEN_STATUS_PHRASE =
  /\b(open daily|open for the season|tasting room hours|tap ?room hours|regular business hours)\b/i;

// Routine recurring municipal classes / sessions the audit named.
const ROUTINE_CLASS =
  /\b(yoga|pilates|cardio sculpt|zumba|barre|spin class|cycle class|silver ?sneakers|tai chi|water aerobics|line danc)\b/i;

const ROUTINE_GOV =
  /\b(council work ?session|council work ?shop|work ?session|committee meeting|board work ?session|budget work ?session|commission meeting)\b/i;

/**
 * True when a feed title is a venue open-status rather than an event.
 * Recurrence is not required: a terminal "Tasting Room Open" is a status
 * whether it appears once or fifteen times.
 */
export function isVenueStatusNonEvent(title: string): boolean {
  const t = (title || "").trim();
  if (!t) return false;
  return VENUE_STATUS.test(t) || OPEN_STATUS_PHRASE.test(t);
}

/**
 * True when a recurring feed series is a routine class or government
 * work session. Only meaningful when the caller knows it recurs, so
 * callers must gate this on their own recurrence signal.
 */
export function isRoutineRecurringClass(title: string): boolean {
  const t = (title || "").trim();
  if (!t) return false;
  return ROUTINE_CLASS.test(t) || ROUTINE_GOV.test(t);
}
