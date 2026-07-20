/**
 * The write-side half of the honest-expiry guarantee.
 *
 * The pure read layer (beacon.ts) refuses to render a beacon once `now` passes
 * its `expires_at`. This function makes sure that `expires_at` is always a sane,
 * bounded time in the first place, no matter what an operator (or a forged
 * request) sends. It is deliberately pure so the cap can be unit-tested on its
 * own, away from the network and the database.
 *
 * The rules:
 *   - The window always starts now.
 *   - An operator's stated "until" is honored when it is a real future time.
 *   - It is CAPPED at MAX_BEACON_HOURS out, so a truck that forgets to pack up
 *     (or a request that asks for a week) still ages off the map on its own.
 *   - A missing, malformed, or already-past "until" falls back to a short
 *     DEFAULT window rather than trusting the input.
 */

export const MAX_BEACON_HOURS = 8;
export const DEFAULT_BEACON_HOURS = 2;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Resolve the [startedAt, expiresAt) window for a new beacon.
 *
 * `until` is whatever the request supplied (an ISO string, or anything else).
 * The returned `expiresAt` is guaranteed to be strictly after `now` and no more
 * than MAX_BEACON_HOURS beyond it.
 */
export function resolveBeaconWindow(
  now: Date,
  until?: unknown,
): { startedAt: Date; expiresAt: Date } {
  const nowMs = now.getTime();
  const maxMs = nowMs + MAX_BEACON_HOURS * HOUR_MS;

  let endMs: number;
  const parsed = typeof until === "string" ? Date.parse(until) : NaN;
  if (Number.isFinite(parsed) && parsed > nowMs) {
    endMs = Math.min(parsed, maxMs);
  } else {
    // No usable "until": a short honest window, never an open-ended one.
    endMs = nowMs + DEFAULT_BEACON_HOURS * HOUR_MS;
  }

  return { startedAt: new Date(nowMs), expiresAt: new Date(endMs) };
}
