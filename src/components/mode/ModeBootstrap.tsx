"use client";

import { useEffect } from "react";
import { suggestModeFromLocation } from "@/hooks/useMode";

/**
 * ModeBootstrap — the one mount-time hook that runs the optional
 * geolocation-based mode suggestion. Renders nothing.
 *
 * Behavior contract (matches the brief):
 *   • First-load with no stored mode → fire-and-forget the geo probe.
 *   • Probe inside the Frederick County bbox → write "resident" to
 *     localStorage; the rest of the app updates via useSyncExternalStore.
 *   • Probe outside / denied / error → leave the default (Visitor)
 *     and mark the suggestion attempted so we never re-prompt.
 *   • Returning users with a stored value → no-op (the function
 *     short-circuits before requesting permission).
 *
 * The map paints with the default mode immediately; this just flips
 * the mode quietly if the user matches the resident heuristic.
 */
export default function ModeBootstrap() {
  useEffect(() => {
    suggestModeFromLocation();
  }, []);
  return null;
}
