/**
 * visible.ts — the single source of truth for "is this event still
 * worth showing?"
 *
 * The audit found past events leaking into "upcoming" modules on more
 * than one surface (a May event under /radius "within reach", a June 1
 * event under a place page's "Upcoming" on June 4). The root cause was
 * that each surface decided "upcoming" for itself — some filtered, some
 * trusted data that was baked at build time and had since gone stale.
 *
 * Every surface that shows "upcoming / within reach / on this page"
 * events should route through `isUpcomingEvent` / `getVisibleEvents`
 * so they all agree on the rule, and so a past event can never appear
 * as upcoming regardless of when its data was generated.
 *
 * The rule, stated once: an event is visible if it is happening now
 * (started, not yet ended) OR starts in the future. Equivalent to
 * `ends_at >= now` — once it's over, it's gone. Times are absolute
 * instants (ISO with offset), so this is timezone- and DST-safe with
 * no wall-clock arithmetic.
 */

/** The minimum shape we need to judge visibility. */
export type TimedEvent = { starts_at: string; ends_at?: string | null };

/**
 * True if the event is live or still in the future as of `now`.
 *
 * `ends_at` is optional in some feed shapes; when it's missing or
 * unparseable we fall back to the start time, so a single-instant
 * event (start only) still drops once its start is in the past.
 */
export function isUpcomingEvent(e: TimedEvent, now: Date = new Date()): boolean {
  const nowMs = now.getTime();
  const endMs = e.ends_at ? Date.parse(e.ends_at) : NaN;
  if (Number.isFinite(endMs)) return endMs >= nowMs;
  const startMs = Date.parse(e.starts_at);
  return Number.isFinite(startMs) && startMs >= nowMs;
}

/**
 * Filter a list to only the live/future events, soonest first. Never
 * mutates the input. Use anywhere a surface renders "upcoming" events.
 */
export function getVisibleEvents<E extends TimedEvent>(
  events: readonly E[],
  now: Date = new Date(),
): E[] {
  return events
    .filter((e) => isUpcomingEvent(e, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/**
 * Per-source time-sanity guard (June-9 deep audit P1-11).
 *
 * Some extracted/feed rows carry impossible curtain times — the Weinberg
 * slate listed "TED Democracy Live" at 7:00 AM and the audit caught it
 * published as-is. A stage/screen/nightlife event starting between
 * midnight and 9 AM Eastern is a parsing artifact, not a curtain; rather
 * than publish a wrong time, the unified pipeline withholds the row until
 * the source is fixed ("flag, don't publish").
 *
 * Deliberately narrow: only categories where pre-9-AM starts are
 * implausible. An 8 AM road race (sports/outdoors), a 7 AM farmers
 * market, or an all-day festival is untouched. Curated seed events are
 * hand-authored and never run through this. 9:00 AM exactly is allowed
 * (the audit's boundary).
 */
const PRE9_IMPLAUSIBLE_CATEGORIES = new Set(["theater", "arts", "music", "nightlife", "film"]);

export function hasImplausibleStartTime(e: {
  starts_at: string;
  category?: string | null;
  is_all_day?: boolean;
}): boolean {
  if (e.is_all_day) return false;
  if (!PRE9_IMPLAUSIBLE_CATEGORIES.has(e.category ?? "")) return false;
  const t = Date.parse(e.starts_at);
  if (!Number.isFinite(t)) return false;
  const h =
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      }).format(new Date(t)),
    ) % 24;
  return h < 9;
}
