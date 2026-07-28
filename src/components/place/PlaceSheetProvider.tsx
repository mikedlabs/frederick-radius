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
  const openPathRef = useRef(pathname);
  // Quietly record the open so /saved's "Recently viewed" row can
  // surface it later. Stored locally only; the slug is the entire
  // payload, so there's no PII trail beyond what the user can already
  // see in their own URL bar.
  const pushRecent = usePushRecentPlace();
  const openSheet = useCallback(
    (p: PlaceCardData) => {
      openerRef.current =
        typeof document !== "undefined" && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      // Capture this at the moment the sheet opens. The map updates its camera,
      // layers, and query through native history replacement; relying on a
      // layout-level `useSearchParams` snapshot can therefore miss the latest
      // values. A validated pathname is safe to carry into the full detail.
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
      setPlace(p);
      pushRecent(p.slug);
    },
    [pathname, pushRecent],
  );
  const closeSheet = useCallback(() => {
    setPlace(null);
    setMapReturnTo(null);
  }, []);

  // The provider survives App Router navigation. Close at this level so a
  // user who presses Back while the lazy sheet bundle is still loading cannot
  // have that sheet appear later over the destination page.
  useEffect(() => {
    if (!place || pathname === openPathRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route ownership changed; discard the pending overlay before its lazy bundle resolves
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
            />
          )}
        >
          <PlaceSheet
            place={place}
            mapReturnTo={mapReturnTo}
            onClose={closeSheet}
            returnFocusRef={openerRef}
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
