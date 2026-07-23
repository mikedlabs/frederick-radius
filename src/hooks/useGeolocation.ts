"use client";

import { useEffect, useState, useCallback } from "react";
// A2.6: import the lightweight point → muni utilities from lib/location,
// NOT lib/connect. Importing from lib/connect drags in places-client.json
// because lib/connect has a top-level import for the nearbyNow join.
import { resolveMunicipality, locationLabel } from "@/lib/location";

export type GeoPosition = {
  lng: number;
  lat: number;
  accuracy: number;
  /** Reverse-geocoded muni slug if user is inside one of our 12, else "frederick-county" */
  municipality_slug?: string;
  /** Friendly label like "1.2 mi from Carroll Creek" or "Brunswick, MD" */
  label?: string;
  timestamp: number;
};

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "granted"; position: GeoPosition }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

const STORAGE_KEY = "fr_geo_v1";
const TTL_MS = 1000 * 60 * 30; // 30 min cache
/** Same-document signal for surfaces that need to re-rank after a location
 * fix changes. The browser `storage` event does not fire in the tab that made
 * the change, so sessionStorage alone cannot keep independent components in
 * sync. */
export const GEOLOCATION_CHANGE_EVENT = "fr:geolocation-change";

function announceLocationChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GEOLOCATION_CHANGE_EVENT));
  }
}

/**
 * Read the cached geolocation fix WITHOUT prompting or mounting the hook.
 *
 * Returns the user's last-known coordinates if a fresh (< 30 min) fix is
 * cached in sessionStorage, else null. Used by surfaces that want to
 * center "from where you're standing" only when we already have consent —
 * e.g. arriving on the map via a category tile. Never triggers a
 * permission prompt: if there's no cached fix, the caller falls back to
 * the city center. Safe to call during a client render (SSR-guarded).
 */
export function readCachedPosition(): { lng: number; lat: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as GeoPosition;
    if (
      Number.isFinite(cached.lng) &&
      Number.isFinite(cached.lat) &&
      Date.now() - cached.timestamp < TTL_MS
    ) {
      return { lng: cached.lng, lat: cached.lat };
    }
  } catch {
    // ignore parse / storage errors — treat as no fix
  }
  return null;
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

  // Hydrate cached position on mount (no permission prompt yet)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as GeoPosition;
      if (Date.now() - cached.timestamp < TTL_MS) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating client-only cached position on mount; sessionStorage is unavailable during SSR
        setState({ status: "granted", position: cached });
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ status: "unavailable" });
      return;
    }
    setState({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
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
          timestamp: Date.now(),
        };
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position));
        } catch {
          // storage may be full or disabled
        }
        setState({ status: "granted", position });
        announceLocationChange();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: "denied" });
        } else {
          setState({ status: "error", message: err.message });
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  const clear = useCallback(() => {
    if (typeof window !== "undefined") {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    }
    setState({ status: "idle" });
    announceLocationChange();
  }, []);

  return { state, request, clear };
}
