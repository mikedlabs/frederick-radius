/**
 * One client-safe motion budget for the live app.
 *
 * CSS already honors prefers-reduced-motion. Data-heavy map surfaces also
 * need to respect the browser's Save-Data signal so long glides, repeated
 * ripples, and multi-stream camera views do not spend battery or bandwidth
 * when the device has asked us not to.
 */

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
  };
};

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
}

export function prefersReducedData(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as NavigatorWithConnection).connection?.saveData);
}

export function shouldLimitLiveEffects(): boolean {
  return prefersReducedMotion() || prefersReducedData();
}
