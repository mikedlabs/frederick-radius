/**
 * relativeTime — pure time-label helpers shared by LiveTime and any
 * freshness / countdown UI on the app.
 *
 * Kept framework-free (no React, no Date.now inside) so the label logic is
 * unit-testable in isolation and safe to import from server or client. The
 * caller supplies the elapsed / remaining milliseconds; these functions only
 * format. That separation is what lets LiveTime tick without re-deriving
 * copy rules, and lets the tests pin the wording without faking the clock.
 */

/**
 * "just now" / "5m ago" / "2h ago" / "3d ago" from an age in milliseconds.
 * Under 45s reads "just now" so a freshly-rendered page doesn't flicker
 * "0m ago". Negative ages (clock skew) clamp to "just now".
 */
export function agoLabel(ageMs: number): string {
  const s = Math.max(0, Math.round(ageMs / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Compact countdown "1h 49m" / "12m" / "45s" / "now" from ms remaining.
 * Shows h+m once an hour or more is left, m alone under an hour, and
 * seconds only in the final minute so the tail reads "45s ... now" rather
 * than "0m". Zero or past clamps to "now".
 */
export function untilLabel(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  if (s <= 0) return "now";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
