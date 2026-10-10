/**
 * Optional fields from the event data layer (PR #1740, head 7ba7ae1b).
 *
 * These are not on EventWithMeta on main yet. Today reads them when present
 * and degrades when they are absent. Do not write these fields here, and do
 * not import #1740 modules until that PR merges.
 */

export type TodayEventScope = "public" | "campus" | "notice";
export type TodayEndTrust = "ok" | "untrusted" | "absent";

function readUnknown(event: object, key: string): unknown {
  return (event as Record<string, unknown>)[key];
}

/** Confident match into places-client.json. Missing on ~44% of events. */
export function eventPlaceId(event: object): string | null {
  const value = readUnknown(event, "place_id");
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Optional `event_scope` on a row. A missing value is public so current
 * events keep appearing until #1740 lands the field on EventWithMeta.
 */
export function eventPublicScope(event: object): TodayEventScope {
  const value = readUnknown(event, "event_scope");
  if (value === "campus" || value === "notice" || value === "public") {
    return value;
  }
  return "public";
}

/**
 * Today hides campus and notice. This is the one scope check.
 *
 * #1740 exports `eventHiddenFromToday(scope)` from
 * `src/lib/events/eventScope.ts`. Do not import it until that PR merges.
 * After it lands, keep this wrapper and swap the body to:
 * `eventHiddenFromToday(eventPublicScope(event))` using that helper.
 */
export function eventHiddenFromToday(event: object): boolean {
  const scope = eventPublicScope(event);
  return scope === "campus" || scope === "notice";
}

/**
 * Live and wrapped labels are honest only when end_trust is "ok".
 * Boolean true is accepted for the in-flight rework that used a flag.
 * Anything else, including a present-but-not-ok value, is untrusted.
 */
export function eventEndTrust(event: object): TodayEndTrust {
  if (!Object.prototype.hasOwnProperty.call(event, "end_trust")) return "absent";
  const value = readUnknown(event, "end_trust");
  if (value === "ok" || value === true) return "ok";
  return "untrusted";
}

/**
 * FCPL and a few other feeds emit `2026-10-11 18:00:00+00` (space instead
 * of T, bare +00 offset). Safari/WebKit rejects that, and the PWA runs in
 * Safari on iPhone. #1740 will normalize these upstream. Until then, coerce
 * to a real ISO instant before any Date/Intl work on Today.
 */
export function toIsoInstant(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Parsed instant, or null when the string is not a usable timestamp. */
export function eventInstant(value: string): Date | null {
  const iso = toIsoInstant(value);
  return iso ? new Date(iso) : null;
}

/**
 * Copy an event with starts_at / ends_at coerced to ISO so existing helpers
 * (`eventDateBlock`, `isEventLiveNow`, `easternDayKey`) stay Safari-safe.
 */
export function eventWithIsoInstants<T extends { starts_at: string; ends_at?: string | null }>(
  event: T,
): T {
  const starts = toIsoInstant(event.starts_at);
  const ends = event.ends_at ? toIsoInstant(event.ends_at) : null;
  return {
    ...event,
    starts_at: starts ?? event.starts_at,
    ends_at: ends ?? event.ends_at,
  };
}

/** Cap repeats. Prefer the data-layer key; callers supply a heuristic fallback. */
export function eventSeriesKey(
  event: object,
  fallback: string,
): string {
  const value = readUnknown(event, "series_key");
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
