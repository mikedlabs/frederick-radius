"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { suggestModeFromLocation, useMode } from "@/hooks/useMode";

/**
 * ModeBootstrap — the one mount-time hook that runs the optional
 * geolocation-based mode suggestion. Renders nothing.
 *
 * Behavior contract:
 *   • First-load with no stored mode → fire-and-forget the geo probe.
 *   • Probe inside the Frederick County bbox → write "resident".
 *   • Probe outside / denied / error → leave the default (Visitor).
 *   • Returning users with a stored value → no-op.
 *
 * Being physically in-county does NOT actually prove residency — a
 * visitor standing downtown trips the same heuristic (the sims caught a
 * visitor getting silently switched to Resident, which hides the "Where
 * to stay" door). So when we auto-flip to Resident we now surface a quiet,
 * one-time, reversible toast instead of changing the lens silently. The
 * resident default still serves the majority (locals); the visitor gets
 * an obvious one-tap way out.
 */
export default function ModeBootstrap() {
  const { setMode } = useMode();
  useEffect(() => {
    suggestModeFromLocation({
      onSuggest: (mode) => {
        if (mode !== "resident") return;
        toast("Showing the resident view", {
          description: "Just visiting Frederick? Switch the view anytime.",
          action: { label: "I'm visiting", onClick: () => setMode("visitor") },
          duration: 8000,
        });
      },
    });
  }, [setMode]);
  return null;
}
