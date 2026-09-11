"use client";

import { useEffect, useState } from "react";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * Lazily load the client place set (`places-client.json`, ~1.5 MB) AFTER
 * mount via a dynamic import, so its main-thread parse stays off the
 * critical path. Surfaces this on the default /map route, where parsing
 * the blob up front was the dominant cold-load cost — the map canvas
 * and reach controls paint first and the places stream in a tick later.
 *
 * Returns the decorated places plus a `ready` flag so callers can show a
 * quiet "finding places…" affordance instead of a false "nothing here"
 * during the brief load. A failed chunk resolves to `ready: true` with
 * an empty set rather than spinning forever.
 *
 * Kept in its own module on purpose: the React-hooks lint analyzer bails
 * on a component that inlines `await import(...)`, which would silently
 * disable set-state-in-effect checks across the rest of that component.
 * Isolating the dynamic import here keeps consumers fully analyzed.
 */
export function useClientPlaces(): { places: PlaceCardData[]; ready: boolean } {
  const [places, setPlaces] = useState<PlaceCardData[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await import("@/lib/loaders/places-client");
        if (cancelled) return;
        setPlaces(m.clientPlaces());
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { places, ready };
}
