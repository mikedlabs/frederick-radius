"use client";

import { useEffect } from "react";
import { suggestModeFromLocation } from "@/hooks/useMode";

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
 * The auto-flip to Resident is SILENT (owner call: the "are you
 * visiting" toast shouldn't pop up). The resident default serves the
 * majority — locals get the right lens on arrival without a startup nag.
 * Trade-off knowingly accepted: a visitor who opens the app while
 * standing in-county is flipped to Resident too and won't see the
 * Visitor "Where to stay" door until they switch the lens in Settings.
 * If that edge needs addressing later, prefer a discoverable in-page
 * affordance over a re-introduced startup popup.
 */
export default function ModeBootstrap() {
  useEffect(() => {
    // Silent: persists the lens, no toast.
    suggestModeFromLocation();
  }, []);
  return null;
}
