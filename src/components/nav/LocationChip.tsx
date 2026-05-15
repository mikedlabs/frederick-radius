"use client";

import { useMemo } from "react";
import { MapPin, Navigation, Loader2, AlertCircle } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { haptic } from "@/lib/haptics";
import { MUNICIPALITIES } from "@/data/municipalities";

/**
 * Top-bar chip showing the user's location context.
 * Default: "Frederick, MD" → tap → asks for location.
 * Granted: shows muni name or "1.2 mi from Carroll Creek".
 */
export default function LocationChip() {
  const { state, request, clear } = useGeolocation();

  // Find nearest municipality center if we have a position
  const nearestMuni = useMemo(() => {
    if (state.status !== "granted") return null;
    let best: { slug: string; name: string; distance_km: number } | null = null;
    for (const m of MUNICIPALITIES) {
      const dx = (m.centroid.lng - state.position.lng) * 111 * Math.cos((state.position.lat * Math.PI) / 180);
      const dy = (m.centroid.lat - state.position.lat) * 111;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (!best || d < best.distance_km) {
        best = { slug: m.slug, name: m.name, distance_km: d };
      }
    }
    return best;
  }, [state]);

  if (state.status === "granted" && nearestMuni) {
    return (
      <button
        type="button"
        onClick={() => { haptic("light"); clear(); }}
        className="inline-flex items-center gap-1 rounded-full border bg-[var(--app-bg-elevated)] px-2 py-1 text-[11px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
        style={{ borderColor: "var(--app-border)", color: "var(--app-cool)" }}
        title="Tap to clear your location"
      >
        <Navigation className="h-3 w-3" strokeWidth={2} aria-hidden />
        {nearestMuni.distance_km < 1
          ? `Near ${nearestMuni.name}`
          : `${nearestMuni.distance_km.toFixed(1)} km from ${nearestMuni.name}`}
      </button>
    );
  }

  if (state.status === "loading") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border bg-[var(--app-bg-elevated)] px-2 py-1 text-[11px] font-medium"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} aria-hidden />
        Locating…
      </span>
    );
  }

  if (state.status === "denied") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border bg-[var(--app-bg-elevated)] px-2 py-1 text-[11px] font-medium"
        style={{ borderColor: "var(--app-border)", color: "var(--app-warning)" }}
        title="Location permission denied — enable in browser settings"
      >
        <AlertCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
        Frederick, MD
      </span>
    );
  }

  // idle / unavailable / error → default chip with action to request
  return (
    <button
      type="button"
      onClick={() => { haptic("medium"); request(); }}
      className="inline-flex items-center gap-1 rounded-full border bg-[var(--app-bg-elevated)] px-2 py-1 text-[11px] font-medium transition hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      title="Use your location for accurate distances"
    >
      <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
      Frederick, MD
    </button>
  );
}
