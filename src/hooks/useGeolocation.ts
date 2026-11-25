"use client";

import { useEffect, useState, useCallback } from "react";
// A2.6: import the lightweight point → muni utilities from lib/location,
// NOT lib/connect. Importing from lib/connect drags in places-client.json
// because lib/connect has a top-level import for the nearbyNow join.
import { resolveMunicipality, locationLabel } from "@/lib/location";

import {
  clearGeoPosition, GEOLOCATION_CHANGE_EVENT, persistGeoPosition, readCachedGeoPosition,
  type GeoPosition,
} from "@/lib/device-location-cache";
export { GEOLOCATION_CHANGE_EVENT, readCachedGeoPosition, type GeoPosition };

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "granted"; position: GeoPosition }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

/** A refusal has its own event: listeners of GEOLOCATION_CHANGE_EVENT treat
 * it as a new device fix and refresh ranking (Today's daypart shelves reset
 * the chosen category), which a refusal must not trigger. */
export const GEOLOCATION_REFUSAL_EVENT = "fr:geolocation-refusal";

/**
 * The last refusal in this document, shared like a granted fix so every
 * surface explains it. A denial asked for in the header must reach the page
 * under it, which no longer has a location control of its own. Kept in
 * memory only: a reload starts fresh, and a later grant clears it.
 */
let clearGeneration = 0;
let lastRefusal: "denied" | "unavailable" | null = null;

/** Record a refusal and tell every same-tab surface. */
export function announceLocationRefusal(status: "denied" | "unavailable"): void {
  lastRefusal = status;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GEOLOCATION_REFUSAL_EVENT));
  }
}

/** Test seam: forget the shared refusal between cases. */
export function resetLocationRefusalForTests(): void {
  lastRefusal = null;
}

export function cacheGeolocationPosition(position: GeoPosition): void {
  lastRefusal = null;
  persistGeoPosition(position);
}

/** Coordinate-only compatibility reader for ranking consumers that should not
 * need to know about GPS precision. The map uses the full reader so it can
 * visualize the browser's honest accuracy instead of implying a perfect fix. */
export function readCachedPosition(): { lng: number; lat: number } | null {
  const cached = readCachedGeoPosition();
  return cached ? { lng: cached.lng, lat: cached.lat } : null;
}

/**
 * Geolocation hook with cached position + permission awareness.
 * Returns state + a request() function for explicit opt-in.
 *
 * Behavior:
 *   - On mount, hydrate from sessionStorage cache if fresh (< 30 min)
 *   - Don't auto-prompt — wait for user to call request()
 *   - On grant, persist to cache and to state
 *   - Watch for low-quality positions (>1000m accuracy) and warn
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });

  // Hydrate cached position on mount (no permission prompt yet), then follow
  // fixes granted by another surface in this tab. Without the same-document
  // listener, choosing Near me in the top bar updated its own hook but left Ask
  // showing the county fallback until a reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncCachedPosition = () => {
      const cached = readCachedGeoPosition();
      setState(
        // A refusal always postdates any cached fix (a grant clears it), so
        // it wins over a fix still fresh in session storage.
        lastRefusal
          ? { status: lastRefusal }
          : cached
            ? { status: "granted", position: cached }
            : { status: "idle" },
      );
    };
    syncCachedPosition();
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, syncCachedPosition);
    window.addEventListener(GEOLOCATION_REFUSAL_EVENT, syncCachedPosition);
    return () => {
      window.removeEventListener(GEOLOCATION_CHANGE_EVENT, syncCachedPosition);
      window.removeEventListener(GEOLOCATION_REFUSAL_EVENT, syncCachedPosition);
    };
  }, []);

  const requestPosition = useCallback((enableHighAccuracy: boolean) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ status: "unavailable" });
      announceLocationRefusal("unavailable");
      return;
    }
    const generation = clearGeneration;
    setState({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (generation !== clearGeneration) return;
        const coords = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
        };
        // Resolve the municipality + friendly label locally via the
        // connectivity layer — pure, offline, no reverse-geocode key.
        // This finally populates the two fields GeoPosition has always
        // declared but nothing ever filled.
        const hit = resolveMunicipality(coords);
        const position: GeoPosition = {
          ...coords,
          accuracy: pos.coords.accuracy,
          municipality_slug: hit.inside
            ? hit.municipality.slug
            : "frederick-county",
          label: locationLabel(coords),
          timestamp: Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now(),
        };
        cacheGeolocationPosition(position);
      },
      (err) => {
        if (generation !== clearGeneration) return;
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: "denied" });
          announceLocationRefusal("denied");
        } else {
          setState({ status: "error", message: err.message });
        }
      },
      {
        enableHighAccuracy,
        timeout: 8000,
        maximumAge: 60_000,
      }
    );
  }, []);
  const request = useCallback(() => requestPosition(false), [requestPosition]);
  const requestHighAccuracy = useCallback(
    () => requestPosition(true),
    [requestPosition],
  );
  /**
   * Refresh an already-granted location without opening a browser prompt.
   *
   * This is intentionally separate from request(): map and search surfaces can
   * quietly restore local ranking for a returning visitor, while a first-time
   * visitor still gets context before deciding whether to share location.
   */
  const requestIfGranted = useCallback(async (): Promise<boolean> => {
    if (
      typeof navigator === "undefined" ||
      !("permissions" in navigator) ||
      typeof navigator.permissions?.query !== "function"
    ) {
      return false;
    }

    const generation = clearGeneration;
    try {
      const permission = await navigator.permissions.query({
        name: "geolocation",
      });
      if (permission.state !== "granted" || generation !== clearGeneration) return false;
      requestPosition(false);
      return true;
    } catch {
      // Safari and privacy-hardened browsers can reject Permissions queries.
      // Falling back to the explicit locate control preserves consent.
      return false;
    }
  }, [requestPosition]);

  const clear = useCallback(() => {
    clearGeneration++;
    lastRefusal = null;
    clearGeoPosition();
  }, []);

  return { state, request, requestHighAccuracy, requestIfGranted, clear };
}
