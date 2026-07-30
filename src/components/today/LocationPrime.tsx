"use client";

import { Navigation } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { setScope } from "@/lib/scope";

/**
 * LocationPrime — the page's ONE location opt-in, as a COMPACT pill that rides
 * on the RIGHT of the "I want…" bar (see CravingStrip), opposite the label, so
 * the consent and the craving prompt share one tidy row instead of two stacked
 * spots. Two surfaces below want the same permission (the craving tiles and
 * NearbyNow); both read the same useGeolocation hook, so one tap here lights up
 * both. Self-hides once granted — the bar then carries just "I want…". Honors
 * the no-auto-prompt rule: geolocation only fires on an explicit tap.
 */
export default function LocationPrime() {
  const { state, request } = useGeolocation();
  if (state.status === "granted" || state.status === "unavailable") return null;

  const denied = state.status === "denied";
  const loading = state.status === "loading";
  // Denied can't be fixed in-app (browser setting), so it's a calm static
  // hint, not a button; idle/loading is the tappable consent.
  const label = denied ? "Location off" : loading ? "Locating…" : "Use my location";

  const useMyLocation = () => {
    if (loading || denied) return;
    // The control promises location-aware answers, so it must also switch
    // decision scope away from any town saved earlier in the visit.
    setScope("nearme");
    request();
  };

  return (
    <button
      type="button"
      onClick={useMyLocation}
      aria-label="Use my location so nearby answers start with the closest useful place"
      aria-disabled={denied || loading}
      className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition"
      style={{
        borderColor: "var(--app-border)",
        background: denied ? "transparent" : "color-mix(in srgb, var(--app-cool) 11%, var(--app-bg-elevated))",
        color: denied ? "var(--app-ink-3)" : "var(--app-cool)",
        boxShadow: denied ? undefined : "var(--app-edge), var(--app-hi)",
      }}
    >
      <Navigation className={`h-3.5 w-3.5 ${loading ? "animate-pulse" : ""}`} strokeWidth={2.25} aria-hidden />
      {label}
    </button>
  );
}
