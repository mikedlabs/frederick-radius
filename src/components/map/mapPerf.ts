import { track } from "@/lib/track";

/**
 * Map load instrumentation. The map's felt slowness was diagnosed but never
 * MEASURED, so these marks prove the cost on real hardware and prod rather
 * than in argument. One of the two costs they were built to watch is gone —
 * the runtime palette walk died with the move to a self-hosted style that
 * ships already branded — which leaves the 1.8 MB client dataset, and the
 * marks are how the next cut of that gets judged. Guarded for SSR/edge where
 * `performance` may be absent; fires the analytics event exactly once.
 */
let idleMarked = false;

function canMark(): boolean {
  return typeof performance !== "undefined" && typeof performance.mark === "function";
}

/** Reset the one-shot latch (tests only). */
export function resetMapPerf(): void {
  idleMarked = false;
}

/** Mapbox `onLoad` fired — style + first tiles are in. */
export function markMapOnLoad(): void {
  if (canMark()) performance.mark("fr-map-onload");
}

/**
 * First settled `onMoveEnd` — the map is interactive and idle. Measures
 * onLoad→idle once and reports it. No-op on every subsequent call.
 */
export function markMapIdleOnce(): void {
  if (idleMarked || !canMark()) return;
  idleMarked = true;
  performance.mark("fr-map-idle");
  try {
    performance.measure("fr-map-onload-to-idle", "fr-map-onload", "fr-map-idle");
    const entry = performance.getEntriesByName?.("fr-map-onload-to-idle")?.[0];
    if (entry) track("map_ready", { ms_onload_to_idle: Math.round(entry.duration) });
  } catch {
    /* marks missing — ignore */
  }
}
