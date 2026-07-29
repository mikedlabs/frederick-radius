"use client";

import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { PlaceCardData } from "@/lib/loaders/places";
import { usePushRecentPlace } from "@/hooks/useRecentPlaces";
import { normalizeMapReturnTo } from "@/lib/map-return";
import LazySheetFallback from "@/components/ui/LazySheetFallback";

const PlaceSheet = lazy(() => import("./PlaceSheet"));
let placeLayerSequence = 0;

type Ctx = {
  openSheet: (p: PlaceCardData) => void;
  closeSheet: () => void;
};

const PlaceSheetContext = createContext<Ctx | null>(null);

export function PlaceSheetProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [place, setPlace] = useState<PlaceCardData | null>(null);
  const [mapReturnTo, setMapReturnTo] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const historyLayerIdRef = useRef("");
  const activePlaceSlugRef = useRef<string | null>(null);
  const openPathRef = useRef(pathname);
  // Quietly record the open so /saved's "Recently viewed" row can
  // surface it later. Stored locally only; the slug is the entire
  // payload, so there's no PII trail beyond what the user can already
  // see in their own URL bar.
  const pushRecent = usePushRecentPlace();
  const openSheet = useCallback(
    (p: PlaceCardData) => {
      const hydrationUpdate = activePlaceSlugRef.current === p.slug;
      if (!hydrationUpdate) {
        openerRef.current =
          typeof document !== "undefined" && document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        historyLayerIdRef.current = `place-sheet:${Date.now()}:${++placeLayerSequence}`;
        // Capture this only when the sheet first opens. Map replaces a slim pin
        // with a hydrated record moments later; treating that data refresh as a
        // second open used to overwrite the real trigger with a control inside
        // the sheet and stack another temporary history entry.
        const current =
          typeof window === "undefined" ? null : new URL(window.location.href);
        openPathRef.current = current?.pathname ?? pathname;
        setMapReturnTo(
          normalizeMapReturnTo(
            current?.pathname === "/map"
              ? `${current.pathname}${current.search}${current.hash}`
              : current?.searchParams.get("returnTo"),
          ),
        );
        pushRecent(p.slug);
      }
      activePlaceSlugRef.current = p.slug;
      setPlace(p);
    },
    [pathname, pushRecent],
  );
  const closeSheet = useCallback(() => {
    activePlaceSlugRef.current = null;
    setPlace(null);
    setMapReturnTo(null);
  }, []);

  // The provider survives App Router navigation. Close at this level so a
  // user who presses Back while the lazy sheet bundle is still loading cannot
  // have that sheet appear later over the destination page.
  useEffect(() => {
    if (!place || pathname === openPathRef.current) return;
    closeSheet();
  }, [closeSheet, pathname, place]);

  return (
    <PlaceSheetContext.Provider value={{ openSheet, closeSheet }}>
      {children}
      {place ? (
        <Suspense
          fallback={(
            <LazySheetFallback
              label={`Loading ${place.name}`}
              onClose={closeSheet}
              returnFocusRef={openerRef}
              historyLayerId={historyLayerIdRef.current}
            />
          )}
        >
          <PlaceSheet
            place={place}
            mapReturnTo={mapReturnTo}
            onClose={closeSheet}
            returnFocusRef={openerRef}
            historyLayerId={historyLayerIdRef.current}
          />
        </Suspense>
      ) : null}
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
