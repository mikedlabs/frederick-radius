/**
 * Tiny haptic feedback helper. Wraps `navigator.vibrate` so we can call
 * `haptic("light")` anywhere without checking support every time.
 *
 * On iOS Safari the Vibration API is disabled by default (no haptic), but
 * on supported devices (Android, modern iOS web with limited support) this
 * gives a subtle physical confirmation tap.
 *
 * Patterns intentionally short — premium apps use sub-20ms taps.
 */

type Pattern = "light" | "medium" | "heavy" | "success" | "warning" | "error";

const PATTERNS: Record<Pattern, number | number[]> = {
  light: 8,
  medium: 14,
  heavy: 22,
  success: [10, 60, 10],
  warning: [12, 40, 12],
  error: [22, 50, 22],
};

export function haptic(pattern: Pattern = "light"): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (!nav.vibrate) return;
  try {
    const p = PATTERNS[pattern];
    nav.vibrate(p);
  } catch {
    // ignore — some browsers throw if called too rapidly
  }
}
