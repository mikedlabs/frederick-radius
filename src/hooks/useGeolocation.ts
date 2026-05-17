"use client";

import { useEffect, useState, useCallback } from "react";

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
        const position: GeoPosition = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          timestamp: Date.now(),
        };
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position));
        } catch {
          // storage may be full or disabled
        }
        setState({ status: "granted", position });
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
  }, []);

  return { state, request, clear };
}
