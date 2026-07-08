"use client";

import { useEffect, useMemo, useState } from "react";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { savedTasteWant } from "@/lib/today/saved-taste";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * useSavedTasteWant — the "I want…" main category to open by the user's SAVED
 * taste, or null to fall back to the time-of-day default.
 *
 * Post-mount + client-only (saves live in localStorage), so it never touches the
 * first-paint / SSR path: the accordion opens the time-based default, and if the
 * saved list shows a clear pattern this resolves a moment later and the caller
 * swaps the open drawer. Reuses the same /api/places/by-slugs endpoint TasteNudge
 * uses (saves are slugs only; the category join lives server-side to keep
 * places-client.json off the client). Light users never trigger a request.
 */
const MIN_SAVED = 3; // don't fetch or bias until there's a real pattern

export function useSavedTasteWant(): string | null {
  const { slugs } = useFollowedSlugs();
  const [places, setPlaces] = useState<PlaceCardData[] | null>(null);
  const slugsKey = useMemo(() => [...slugs].sort().join(","), [slugs]);

  useEffect(() => {
    if (!slugsKey || slugs.size < MIN_SAVED) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results when saves drop below threshold; no fetch fires
      setPlaces(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(slugsKey)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { places: [] }))
      .then((d: { places: PlaceCardData[] }) => setPlaces(d.places ?? []))
      .catch((err) => {
        if (err && err.name !== "AbortError") setPlaces([]);
      });
    return () => ctrl.abort();
  }, [slugsKey, slugs.size]);

  return useMemo(() => (places ? savedTasteWant(places, slugs) : null), [places, slugs]);
}
