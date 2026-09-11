import { easternParts } from "@/lib/tz";

/**
 * The delivery gate — the single choke point every non-urgent push routes
 * through so a user's quiet hours are honored everywhere at once (fan-out to a
 * topic, an owner broadcast, any cron). Pure and Eastern-time based, matching
 * the rest of the app's clock (easternParts / easternDayKey).
 *
 * Urgency is the escape hatch: civic alerts (NWS/NPS warnings, closures) are
 * marked urgent and ALWAYS deliver, because "a flash-flood warning at 2 AM" is
 * exactly the push a quiet window must not swallow. Everything else respects
 * the window.
 */

/**
 * Is `hour` (0-23, Eastern) inside the quiet window [start, end)? Handles a
 * window that wraps midnight (start > end, e.g. 21..7 = 9 PM to 7 AM). A null
 * bound, or start === end, means "no quiet hours" and returns false.
 */
export function inQuietHours(
  quietStart: number | null | undefined,
  quietEnd: number | null | undefined,
  hour: number,
): boolean {
  if (quietStart == null || quietEnd == null) return false;
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return hour >= quietStart && hour < quietEnd;
  // Window wraps midnight.
  return hour >= quietStart || hour < quietEnd;
}

export type DeliveryPrefs = {
  quiet_start?: number | null;
  quiet_end?: number | null;
};

/**
 * Should this push be delivered to a subscription right now?
 *   - urgent (civic alerts) → always yes;
 *   - otherwise → yes unless the current Eastern hour is in the device's quiet
 *     window.
 */
export function shouldDeliver(
  prefs: DeliveryPrefs,
  opts: { urgent?: boolean },
  now: Date,
): boolean {
  if (opts.urgent) return true;
  const hour = easternParts(now).hour;
  return !inQuietHours(prefs.quiet_start, prefs.quiet_end, hour);
}
