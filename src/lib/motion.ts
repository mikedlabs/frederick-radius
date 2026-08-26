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

/**
 * Map camera moves need one rhythm. Long, unrelated 900-1100ms flights made
 * the map feel as though it was waiting for itself; ad-hoc shorter moves made
 * the same map feel jumpy. These four paces describe intent instead of leaking
 * arbitrary durations into every interaction.
 */
export const MAP_CAMERA_DURATION_MS = {
  /** Keep a selected pin visible above a card or react to an orientation shift. */
  nudge: 360,
  /** Move to one nearby result without turning the map into a flyover. */
  focus: 520,
  /** Fit a route, a group of results, or the county boundary. */
  reframe: 640,
  /** Travel between municipalities or other meaningfully distant contexts. */
  journey: 760,
} as const;

export type MapCameraPace = keyof typeof MAP_CAMERA_DURATION_MS;

/**
 * Returns an instant camera move when either reduced motion or Save-Data is
 * active. Save-Data is treated as a whole-experience budget here: it avoids
 * spending device work on decorative travel while data-heavy layers settle.
 */
export function mapCameraDuration(pace: MapCameraPace): number {
  return shouldLimitLiveEffects() ? 0 : MAP_CAMERA_DURATION_MS[pace];
}
