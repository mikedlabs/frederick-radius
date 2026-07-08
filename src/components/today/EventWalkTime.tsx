"use client";

import { useEffect, useState } from "react";
import { Footprints } from "lucide-react";
import { readCachedPosition } from "@/hooks/useGeolocation";
import { haversineMeters, metersToMinutes, type LngLat } from "@/lib/geo";

/**
 * EventWalkTime — the one decision-useful number on a downtown event tile: how
 * far it is on foot from where you're standing. Renders "12 min walk" (mono,
 * counts-as-support) ONLY when we already have the user's cached location
 * (LocationPrime consent, same fix the craving answers use) AND the venue is a
 * plausible walk. Never prompts, never fabricates: no cached fix → nothing; a
 * low-confidence venue coordinate is filtered by the caller; anything past a
 * short walk self-hides rather than claim a bogus stroll.
 *
 * Uses the SAME straight-line walk math the map + place/event pages use
 * (haversineMeters + metersToMinutes("walk")). Client-only + post-mount, so it
 * can't cause a hydration mismatch — the server renders the tile without it.
 */

// Past ~25 min a "walk" is parody; the tile then shows no foot figure at all
// (honest — the event page's Getting-there stanza carries drive/transit).
const MAX_WALK_MIN = 25;

export default function EventWalkTime({ dest }: { dest: LngLat }) {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const origin = readCachedPosition();
    if (!origin) return;
    const meters = haversineMeters(origin, dest);
    if (!Number.isFinite(meters) || meters <= 0) return;
    const min = Math.max(1, metersToMinutes("walk", meters));
    if (min > MAX_WALK_MIN) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount cached-fix read; sessionStorage is unavailable during SSR
    setMinutes(min);
  }, [dest]);

  if (minutes === null) return null;

  return (
    <p className="mt-1 flex items-center gap-1 px-0.5 font-mono text-[10.5px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
      <Footprints className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-brand-2)" }} />
      {minutes} min walk
    </p>
  );
}
