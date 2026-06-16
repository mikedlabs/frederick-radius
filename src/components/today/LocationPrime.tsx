"use client";

import { Navigation } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";

/**
 * LocationPrime — the contextual location opt-in, ABOVE the "I want" grid.
 *
 * The craving tiles answer "nearest open one," which needs the user's
 * location to be any good — so the consent has to come BEFORE the grid, not
 * buried below it. A calm one-line invite (never a wall): tap to share, and
 * it self-hides once granted (the around-you results below take over). Honors
 * the no-auto-prompt rule — geolocation only fires on an explicit tap.
 */
export default function LocationPrime() {
  const { state, request } = useGeolocation();
  // Granted (or unavailable) — nothing to ask; the grid + NearbyNow use it.
  if (state.status === "granted" || state.status === "unavailable") return null;

  const denied = state.status === "denied";
  const loading = state.status === "loading";

  return (
    <button
      type="button"
      onClick={() => !loading && !denied && request()}
      aria-label="Use my location so nearby answers find the closest open spot"
      className="tactile tactile-interactive flex w-full items-center gap-3 rounded-[var(--app-radius-md)] px-3.5 py-2.5 text-left"
      style={{ background: "color-mix(in srgb, var(--app-cool) 9%, var(--app-bg-elevated))", boxShadow: "var(--app-edge), var(--app-hi)" }}
    >
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 16%, transparent)", color: "var(--app-cool)" }}>
        <Navigation className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
          {denied ? "Location is off" : loading ? "Finding you…" : "Use my location"}
        </span>
        <span className="block text-[12px] leading-snug" style={{ color: "var(--app-ink-3)" }}>
          {denied
            ? "Turn it on in your browser for nearest-open answers."
            : "So “I want…” finds the nearest one open, not just any open."}
        </span>
      </span>
    </button>
  );
}
