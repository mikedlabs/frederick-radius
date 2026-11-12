type ReviewableEvent = {
  venue_slug: string;
  starts_at?: string;
  ends_at?: string;
  source?: { fetchedAt?: string };
};
const ABSOLUTE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

/** Keep the existing one-day grace for a source that supplies no end time. */
export function isExpiredVenueEvent(event: ReviewableEvent, now: Date): boolean {
  if (!event.starts_at || !ABSOLUTE_TIME.test(event.starts_at)) return false;
  const start = Date.parse(event.starts_at);
  if (!Number.isFinite(start)) return false;
  if (event.ends_at) {
    if (!ABSOLUTE_TIME.test(event.ends_at)) return false;
    const end = Date.parse(event.ends_at);
    return Number.isFinite(end) && end >= start && end <= now.getTime();
  }
  return start < now.getTime() - 86_400_000;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
function factKey(event: ReviewableEvent): string {
  const { source, ...facts } = event;
  // A fresh observation alone may renew the same facts. URL/provenance changes,
  // every event field, and missing/invalid dates still require a review.
  const { fetchedAt: _observedAt, ...provenance } = source ?? {};
  void _observedAt;
  return JSON.stringify(stable({ ...facts, ...(source ? { source: provenance } : {}) }));
}
function difference<T>(left: readonly T[], right: readonly T[]): number {
  const remaining = new Map<T, number>();
  for (const key of right) remaining.set(key, (remaining.get(key) ?? 0) + 1);
  return left.filter((key) => {
    const count = remaining.get(key) ?? 0;
    if (count) { remaining.set(key, count - 1); return false; }
    return true;
  }).length;
}

export function reviewVenueCollection(before: readonly ReviewableEvent[], after: readonly ReviewableEvent[], now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("Venue review requires a valid observation clock.");
  const previous = before.filter((event) => !isExpiredVenueEvent(event, now)).map(factKey);
  const next = after.filter((event) => !isExpiredVenueEvent(event, now)).map(factKey);
  const futureAdditions = difference(next, previous);
  const futureRemovals = difference(previous, next);
  const expiredRemovals = difference(before.filter((event) => isExpiredVenueEvent(event, now)).map(factKey),
    after.filter((event) => isExpiredVenueEvent(event, now)).map(factKey));
  return { reviewRequired: futureAdditions > 0 || futureRemovals > 0, futureAdditions, futureRemovals, expiredRemovals };
}
