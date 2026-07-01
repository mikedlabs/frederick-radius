import { track } from "@/lib/track";

/**
 * Map load instrumentation. The map's felt slowness (runtime recolor + a 1.8 MB
 * client dataset) was diagnosed but never MEASURED — so before committing to the
 * big owner refactors (a baked Studio style, a viewport/bbox pins API), we ship
 * marks that prove the cost on real hardware/prod. Pairs with the "fr-palette"
 * measure inside applyFrederickPalette (the recolor cost). Guarded for SSR/edge
 * where `performance` may be absent; fires the analytics event exactly once.
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
