"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import PlaceSheet from "./PlaceSheet";
import type { PlaceCardData } from "@/lib/loaders/places";
import { usePushRecentPlace } from "@/hooks/useRecentPlaces";
import { normalizeMapReturnTo } from "@/lib/map-return";

type Ctx = {
  openSheet: (p: PlaceCardData) => void;
  closeSheet: () => void;
};

const PlaceSheetContext = createContext<Ctx | null>(null);

export function PlaceSheetProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<PlaceCardData | null>(null);
  const [mapReturnTo, setMapReturnTo] = useState<string | null>(null);
  // Quietly record the open so /saved's "Recently viewed" row can
  // surface it later. Stored locally only; the slug is the entire
  // payload, so there's no PII trail beyond what the user can already
  // see in their own URL bar.
  const pushRecent = usePushRecentPlace();
  const openSheet = useCallback(
    (p: PlaceCardData) => {
      // Capture this at the moment the sheet opens. The map updates its camera,
      // layers, and query through native history replacement; relying on a
      // layout-level `useSearchParams` snapshot can therefore miss the latest
      // values. A validated pathname is safe to carry into the full detail.
      const current =
        typeof window === "undefined" ? null : new URL(window.location.href);
      setMapReturnTo(
        normalizeMapReturnTo(
          current?.pathname === "/map"
            ? `${current.pathname}${current.search}${current.hash}`
            : current?.searchParams.get("returnTo"),
        ),
      );
      setPlace(p);
      pushRecent(p.slug);
    },
    [pushRecent],
  );
  const closeSheet = useCallback(() => {
    setPlace(null);
    setMapReturnTo(null);
  }, []);

  return (
    <PlaceSheetContext.Provider value={{ openSheet, closeSheet }}>
      {children}
      <PlaceSheet place={place} mapReturnTo={mapReturnTo} onClose={closeSheet} />
    </PlaceSheetContext.Provider>
  );
}

export function usePlaceSheet(): Ctx {
  const ctx = useContext(PlaceSheetContext);
  if (!ctx) {
    // Graceful no-op so PlaceCards can be used outside the provider
    // (e.g. on the /places/[slug] page itself) without crashing.
    return {
      openSheet: () => {},
      closeSheet: () => {},
    };
  }
  return ctx;
}
