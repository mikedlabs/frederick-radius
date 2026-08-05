// Camera and environment helpers shared by AppMap — pure functions over the
// camera snapshot, the DOM (dock measurement), and browser capabilities.
// Extracted from AppMap.tsx (#77); behavior is byte-identical to the inline
// originals.

import type { Map as MapboxMap } from "mapbox-gl";
import type { LngLat } from "@/lib/geo";
import { MUNICIPALITIES } from "@/data/municipalities";
import { nearbyReachBounds } from "./mapNearbyScope";
import { mapCameraPadding } from "./mapCameraPadding";
import { CAM_EASE, FREDERICK_COUNTY_BOUNDS, RADIUS_M } from "./constants";

export type CameraSnapshot = {
  getZoom: () => number;
  getCenter: () => { lng: number; lat: number };
};

export type ResultViewportMap = CameraSnapshot & {
  getBounds: () => {
    getWest: () => number;
    getEast: () => number;
    getSouth: () => number;
    getNorth: () => number;
  } | null;
};

/** A county overview is a camera state, not a hard-coded zoom. A person can
 * pan the county offscreen without changing zoom, so the recovery control also
 * compares the settled camera with the center of the county fit. A small
 * tolerance avoids flashing the control after an accidental finger wobble. */
export function isCountyOverview(map: CameraSnapshot): boolean {
  const [[west, south], [east, north]] = FREDERICK_COUNTY_BOUNDS;
  const center = map.getCenter();
  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  return (
    map.getZoom() <= 10.6 &&
    Math.abs(center.lng - centerLng) <= (east - west) * 0.12 &&
    Math.abs(center.lat - centerLat) <= (north - south) * 0.12
  );
}

// Does this browser have a usable WebGL context? Mapbox GL needs one; without
// it the canvas stays blank. mapbox-gl v3 dropped the old `supported()` helper,
// so probe directly. Conservative: any throw or missing context → treat as no
// WebGL and fall back to the list view. SSR returns true so we never flash the
// fallback during hydration — the real check runs in a mount effect.
export function hasWebGL(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export function municipalityDisplayName(value: string): string {
  const normalized = value.trim().toLowerCase();
  return (
    MUNICIPALITIES.find(
      (municipality) =>
        municipality.slug === normalized ||
        municipality.name.toLowerCase() === normalized,
    )?.name ?? value
  );
}

/** An instant whose Frederick wall-clock hour equals `scrubHour` — we shift
 *  from "now" by the delta so getOpenStatus (which reads Frederick time)
 *  evaluates hours at the scrubbed hour without constructing a zoned date. */
export function scrubInstant(scrubHour: number): Date {
  const local = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const curH = local.getHours() + local.getMinutes() / 60;
  return new Date(Date.now() + (scrubHour - curH) * 3_600_000);
}

/** True when the viewer asked for reduced motion. The CSS `*` gate can't
 *  reach Mapbox's JS-driven camera, so camera moves check this and pass
 *  duration:0 (instant, no glide). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

/** Keep the county outline clear of whichever edge owns the map instrument.
 * Mobile is bottom-mounted; desktop is top-mounted. A manual refit measures
 * the live controls while first paint uses the same responsive fallback. */
export function countyFitPadding(measureDock = true): { top: number; right: number; bottom: number; left: number } {
  if (typeof window === "undefined") {
    return { top: 96, right: 32, bottom: 64, left: 32 };
  }
  const mapRect = measureDock
    ? document.querySelector<HTMLElement>(".mapboxgl-map")?.getBoundingClientRect()
    : undefined;
  const dock = measureDock
    ? document.querySelector<HTMLElement>("[data-map-dock]")
    : null;
  const dockRect = dock?.getBoundingClientRect();
  const contextRailRect = dock
    ?.closest<HTMLElement>(".dock-host")
    ?.querySelector<HTMLElement>(".map-context-rail")
    ?.getBoundingClientRect();
  const paneRect =
    dock?.classList.contains("dock-open") === true
      ? dock
          .querySelector<HTMLElement>('.dock-pane[aria-hidden="false"]')
          ?.getBoundingClientRect()
      : undefined;

  return mapCameraPadding({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    mapTop: mapRect?.top ?? 0,
    mapBottom: mapRect?.bottom ?? window.innerHeight,
    dockTop: dockRect?.top,
    dockBottom: dockRect?.bottom,
    contextRailBottom: contextRailRect?.bottom,
    paneTop: paneRect?.top,
  });
}

/** Fit the visible map to the same one-mile reach used by the result set and
 * ring. One definition keeps the camera, pins, count, URL, and share state in
 * agreement instead of using an arbitrary zoom number. */
export function fitNearbyRadius(map: MapboxMap, origin: LngLat): void {
  map.fitBounds(nearbyReachBounds(origin, RADIUS_M), {
    padding: countyFitPadding(),
    maxZoom: 14.5,
    duration: prefersReducedMotion() ? 0 : 900,
    easing: CAM_EASE,
    essential: true,
  });
}

export const SHORT_LANDSCAPE_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-179, -80],
  [179, 80],
];
