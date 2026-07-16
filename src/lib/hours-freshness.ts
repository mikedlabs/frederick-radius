/**
 * Hours freshness policy (data brief, Phase 1, section 4.3).
 *
 * The decision record, item 8: open and closed states render only when
 * hours come from Google Places and the row was verified within the
 * freshness window. Everything else renders the existing "Hours not
 * posted" pattern (the unverified state, which the card components
 * already translate into honest silence or "Likely open").
 *
 * Enforcement is staged behind HOURS_FRESHNESS_ENFORCED until the rolling
 * refresh snapshot has enough coverage to keep the Open-now experience useful.
 * Turning the rule on before materializing that snapshot would convert every
 * place to unknown at once. The refresh job supplies recent verification
 * timestamps; once coverage is ready, set the flag and the same read boundary
 * becomes strict without another code change.
 */

export const HOURS_MAX_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function hoursFreshnessEnforced(): boolean {
  return process.env.HOURS_FRESHNESS_ENFORCED === "1";
}

/**
 * True when a verification timestamp is inside the freshness window.
 * A missing or unparseable timestamp is stale by definition: the policy
 * never gives the benefit of the doubt to data it cannot date.
 */
export function isHoursFresh(
  verifiedAtIso: string | undefined,
  now: Date = new Date(),
  maxAgeDays: number = HOURS_MAX_AGE_DAYS,
): boolean {
  if (!verifiedAtIso) return false;
  const t = Date.parse(verifiedAtIso);
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  // A future verification time is usually clock or source corruption. Allow a
  // tiny skew for distributed systems, but never let a bad future date remain
  // "fresh" indefinitely.
  if (age < -5 * 60 * 1000) return false;
  return age <= maxAgeDays * DAY_MS;
}

/**
 * The single decision every read path asks: may this row assert an open or
 * closed state? Both explicit verification and a fresh timestamp are required.
 */
export function mayAssertOpenState(
  hoursVerified: boolean | undefined,
  hoursUpdatedAtIso: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!hoursVerified) return false;
  if (!hoursFreshnessEnforced()) return true;
  return isHoursFresh(hoursUpdatedAtIso, now);
}
