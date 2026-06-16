"use client";

import { Navigation } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";

/**
 * LocationPrime — the ONE location opt-in, ABOVE the "I want" grid.
 *
 * This is the page's single consent. Two surfaces below it want the same
 * permission: the craving tiles ("nearest open one") and NearbyNow ("what's
 * around you"). Both read the same useGeolocation hook, so one tap here lights
 * up both — NearbyNow no longer carries its own button. The copy names BOTH
 * payoffs so the single ask reads true. A calm one-line invite (never a wall),
 * self-hides once granted. Honors the no-auto-prompt rule — geolocation only
 * fires on an explicit tap.
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
            : "So we show the nearest one open and what’s happening around you."}
        </span>
      </span>
    </button>
  );
}
