"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { TravelMode } from "@/lib/geo";

/**
 * Shared Radius state so the homepage hero and the "right now" /
 * "tonight" strips all filter to the SAME live center, distance, and
 * travel mode. Phase 3: the strips are meant to react to the current
 * radius, which only works if the center is lifted out of RadiusBuilder
 * into one provider that wraps the whole home route.
 *
 * Client-only and dependency-free. SSR renders the default center, the
 * client takes over on mount, so there is no hydration divergence (the
 * default is deterministic, not time/location derived).
 */

export type RadiusCenter = { slug: string; label: string; lng: number; lat: number };

export const RADIUS_PRESETS: readonly RadiusCenter[] = [
  { slug: "downtown", label: "Downtown Frederick", lng: -77.4109, lat: 39.4143 },
  { slug: "carroll-creek", label: "Carroll Creek", lng: -77.4109, lat: 39.4137 },
  { slug: "brunswick", label: "Brunswick", lng: -77.628, lat: 39.3134 },
  { slug: "thurmont", label: "Thurmont", lng: -77.4108, lat: 39.6231 },
  { slug: "catoctin", label: "Catoctin trailhead", lng: -77.4505, lat: 39.6361 },
  { slug: "middletown", label: "Middletown", lng: -77.5447, lat: 39.4434 },
] as const;

type RadiusState = {
  center: RadiusCenter;
  mode: TravelMode;
  minutes: number;
  setCenter: (c: RadiusCenter) => void;
  setMode: (m: TravelMode) => void;
  setMinutes: (n: number) => void;
};

const Ctx = createContext<RadiusState | null>(null);

export function RadiusProvider({ children }: { children: React.ReactNode }) {
  const [center, setCenter] = useState<RadiusCenter>(RADIUS_PRESETS[0]);
  const [mode, setMode] = useState<TravelMode>("walk");
  const [minutes, setMinutes] = useState(10);

  const value = useMemo<RadiusState>(
    () => ({ center, mode, minutes, setCenter, setMode, setMinutes }),
    [center, mode, minutes],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the shared radius. Throws if used outside the provider so a
 *  missing wrapper fails loudly in dev rather than silently desyncing. */
export function useRadius(): RadiusState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRadius must be used within <RadiusProvider>");
  return v;
}
