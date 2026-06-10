/**
 * Hours freshness policy (data brief, Phase 1, section 4.3).
 *
 * The decision record, item 8: open and closed states render only when
 * hours come from Google Places and the row was verified within the
 * freshness window. Everything else renders the existing "Hours not
 * posted" pattern (the unverified state, which the card components
 * already translate into honest silence or "Likely open").
 *
 * Enforcement ships behind a flag because flipping it before the rolling
 * refresh cron has populated fresh rows would degrade every open and
 * closed state in the app at once. The sequence is: deploy the cron,
 * let a full 7 day cycle complete, then set HOURS_FRESHNESS_ENFORCED=1.
 * Until then the policy is in code, tested, and inert.
 */

export const HOURS_MAX_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether enforcement is on. Reads the env per call so tests and the
 *  flag flip need no rebuild semantics beyond the deploy itself. */
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
  return now.getTime() - t <= maxAgeDays * DAY_MS;
}

/**
 * The single decision the loader asks: may this row assert an open or
 * closed state? Verified hours are required always; freshness is
 * required only once enforcement is on.
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
