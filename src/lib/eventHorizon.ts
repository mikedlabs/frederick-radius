/**
 * eventHorizon.ts — group events into human time horizons.
 *
 * A flat list "ordered by date and time" is technically correct and
 * completely unreadable: you cannot tell at a glance what is on tonight
 * vs next month, so it reads as a directory you get lost in. People —
 * a kid, a grandparent — think in "now / today / this weekend", not in
 * a 400-row chronological scroll. This turns the same events into those
 * buckets so the shape is obvious before you read a single title.
 *
 * Pure and unit-tested: every boundary is injected (no hidden clock),
 * so it is deterministic and runs identically on server and client.
 */

export type Horizon = "live" | "today" | "weekend" | "week" | "later";

export const HORIZON_LABEL: Record<Horizon, string> = {
  live: "Happening now",
  // "Today", not "Today & tonight": callers pass `next24` = end of today
  // (next Eastern midnight), so this bucket is today only and the label
  // can't quietly include tomorrow's events (the audit flagged that the
  // old rolling +24h window let "Today & tonight" spill into tomorrow).
  today: "Today",
  weekend: "This weekend",
  week: "Later this week",
  later: "Coming up",
};

export type HorizonBounds = {
  /** ms — the current instant. */
  now: number;
  /** ms — end of the "today" bucket: callers pass the next Eastern
   *  midnight, so "today" never includes tomorrow. (Field name is
   *  historical; the value is end-of-today, not a rolling +24h.) */
  next24: number;
  /** ms — Friday 5pm of the upcoming weekend. */
  weekendStart: number;
  /** ms — Monday 0:00 after that weekend. */
  weekendEnd: number;
  /** Slugs the live feed says are happening right now. */
  live: ReadonlySet<string>;
};

type EventLike = { slug: string; starts_at: string; ends_at: string };

/**
 * The horizon a single event belongs to. First match wins, in the
 * order live → today → weekend → week → later. Past events (already
 * ended and not live) return null so the caller can drop them.
 */
export function horizonOf<E extends EventLike>(
  e: E,
  b: HorizonBounds,
): Horizon | null {
  const start = +new Date(e.starts_at);
  const end = +new Date(e.ends_at);

  if (b.live.has(e.slug) || (start <= b.now && end >= b.now)) return "live";
  if (end < b.now) return null; // over, and not live → not upcoming

  if (start >= b.now && start < b.next24) return "today";
  if (start >= b.weekendStart && start < b.weekendEnd) return "weekend";

  const weekEnd = b.now + 7 * 24 * 60 * 60 * 1000;
  if (start >= b.now && start < weekEnd) return "week";
  return "later";
}

export type EventGroup<E> = { key: Horizon; label: string; events: E[] };

const ORDER: Horizon[] = ["live", "today", "weekend", "week", "later"];

/**
 * Partition events into ordered, non-empty horizon groups. Within each
 * group the original (already date-sorted) order is preserved, so
 * "Today & tonight" still reads earliest-first. Σ group sizes ≤ input
 * (past, non-live events are dropped) — every surfaced event lands in
 * exactly one group.
 */
export function groupByHorizon<E extends EventLike>(
  events: E[],
  b: HorizonBounds,
): EventGroup<E>[] {
  const byKey = new Map<Horizon, E[]>();
  for (const e of events) {
    const h = horizonOf(e, b);
    if (!h) continue;
    const arr = byKey.get(h);
    if (arr) arr.push(e);
    else byKey.set(h, [e]);
  }
  return ORDER.filter((k) => byKey.has(k)).map((k) => ({
    key: k,
    label: HORIZON_LABEL[k],
    events: byKey.get(k)!,
  }));
}
