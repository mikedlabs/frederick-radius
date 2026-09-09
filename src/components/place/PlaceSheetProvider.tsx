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
import { usePathname, useRouter } from "next/navigation";
import type { PlaceCardData } from "@/lib/loaders/places";
import { usePushRecentPlace } from "@/hooks/useRecentPlaces";
import { browseReturnFromLocation, withBrowseReturnTo } from "@/lib/browse-return";
import { readCachedGeoPosition } from "@/hooks/useGeolocation";
import { isInFrederickCountyArea, type LngLat } from "@/lib/geo";
import LazySheetFallback from "@/components/ui/LazySheetFallback";
import { navigateAfterHistoryLayer } from "@/hooks/useReversibleHistoryLayer";

const PlaceSheet = lazy(() => import("./PlaceSheet"));
let placeLayerSequence = 0;

function preloadPlaceSheet() {
  void import("./PlaceSheet").catch(() => {
    // A failed speculative request must not create an unhandled page error.
    // React's lazy boundary remains the visible, retryable on-demand path.
  });
}

type Ctx = {
  openSheet: (
    p: PlaceCardData,
    options?: {
      travelOrigin?: (LngLat & { timestamp?: number }) | null;
      returnFocus?: HTMLElement | null;
    },
  ) => void;
  openSheetBySlug: (
    slug: string,
    options?: { returnFocus?: HTMLElement | null },
  ) => void;
  closeSheet: () => void;
};

const PlaceSheetContext = createContext<Ctx | null>(null);
const TRAVEL_ORIGIN_MAX_AGE_MS = 5 * 60_000;

function freshTravelOrigin(
  value: (LngLat & { timestamp?: number }) | null | undefined,
): LngLat | null {
  if (
    !value ||
    !Number.isFinite(value.timestamp) ||
    Date.now() - Number(value.timestamp) < 0 ||
    Date.now() - Number(value.timestamp) > TRAVEL_ORIGIN_MAX_AGE_MS ||
    !isInFrederickCountyArea(value.lng, value.lat)
  ) {
    return null;
  }
  return { lng: value.lng, lat: value.lat };
}

export function PlaceSheetProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [place, setPlace] = useState<PlaceCardData | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [travelOrigin, setTravelOrigin] = useState<LngLat | null>(null);
  const [mapReturnTo, setMapReturnTo] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const historyLayerIdRef = useRef("");
  const activePlaceSlugRef = useRef<string | null>(null);
  const openPathRef = useRef(pathname);
  // A late place lookup must not reopen a sheet after the visitor closes it,
  // follows the canonical page fallback, or taps a different place.
  const reqRef = useRef(0);
  // Quietly record the open so /saved's "Recently viewed" row can
  // surface it later. Stored locally only; the slug is the entire
  // payload, so there's no PII trail beyond what the user can already
  // see in their own URL bar.
  const pushRecent = usePushRecentPlace();

  // The sheet stays out of the initial app bundle, but a map user is likely
  // to open it next. Warm its chunk once the map has painted so an immediate
  // Details tap opens the useful sheet instead of sitting on a loader while a
  // cold browser asks for the lazy bundle. Other routes keep the lazy split.
  useEffect(() => {
    if (pathname !== "/map") return;

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(
        preloadPlaceSheet,
        { timeout: 1_500 },
      );
      return () => window.cancelIdleCallback(idleId);
    }

    const timer = globalThis.setTimeout(preloadPlaceSheet, 250);
    return () => globalThis.clearTimeout(timer);
  }, [pathname]);

  const openSheet = useCallback(
    (
      p: PlaceCardData,
      options?: {
        travelOrigin?: (LngLat & { timestamp?: number }) | null;
        returnFocus?: HTMLElement | null;
      },
    ) => {
      const hydrationUpdate = activePlaceSlugRef.current === p.slug;
      reqRef.current++;
      setPendingSlug(null);
      if (!hydrationUpdate) {
        openerRef.current =
          options?.returnFocus ??
          (typeof document !== "undefined" && document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null);
        historyLayerIdRef.current = `place-sheet:${Date.now()}:${++placeLayerSequence}`;
        // Capture this only when the sheet first opens. Map replaces a slim pin
        // with a hydrated record moments later; treating that data refresh as a
        // second open used to overwrite the real trigger with a control inside
        // the sheet and stack another temporary history entry.
        const current =
          typeof window === "undefined" ? null : new URL(window.location.href);
        openPathRef.current = current?.pathname ?? pathname;
        setMapReturnTo(current ? browseReturnFromLocation(current) : null);
        pushRecent(p.slug);
        const cachedOrigin = options?.travelOrigin ?? readCachedGeoPosition();
        setTravelOrigin(freshTravelOrigin(cachedOrigin));
      } else if (options?.travelOrigin) {
        // A slim map pin is replaced by its full record after the sheet opens.
        // Preserve the same consented origin, while still allowing a fresher
        // fix from the map to replace it during that hydration update.
        setTravelOrigin(freshTravelOrigin(options.travelOrigin));
      }
      activePlaceSlugRef.current = p.slug;
      setPlace(p);
    },
    [pathname, pushRecent],
  );

  const openSheetBySlug = useCallback(
    (
      slug: string,
      options?: { returnFocus?: HTMLElement | null },
    ) => {
      const normalizedSlug = slug.trim();
      if (!normalizedSlug) return;

      openerRef.current =
        options?.returnFocus ??
        (typeof document !== "undefined" && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
      const historyLayerId = `place-sheet:${Date.now()}:${++placeLayerSequence}`;
      historyLayerIdRef.current = historyLayerId;
      const current =
        typeof window === "undefined" ? null : new URL(window.location.href);
      openPathRef.current = current?.pathname ?? pathname;
      const returnTo = current ? browseReturnFromLocation(current) : null;
      setMapReturnTo(returnTo);
      setTravelOrigin(freshTravelOrigin(readCachedGeoPosition()));
      activePlaceSlugRef.current = normalizedSlug;
      const req = ++reqRef.current;
      setPlace(null);
      setPendingSlug(normalizedSlug);

      const goToCanonicalPage = () => {
        if (reqRef.current !== req) return;
        activePlaceSlugRef.current = null;
        setPlace(null);
        setPendingSlug(null);
        setTravelOrigin(null);
        setMapReturnTo(null);
        navigateAfterHistoryLayer(historyLayerId, () => {
          router.push(withBrowseReturnTo(`/places/${encodeURIComponent(normalizedSlug)}`, returnTo));
        });
      };

      fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(normalizedSlug)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { places?: PlaceCardData[] } | null) => {
          if (reqRef.current !== req) return;
          const resolved = Array.isArray(data?.places)
            ? data.places.find((candidate) => candidate.slug === normalizedSlug)
            : null;
          if (!resolved) {
            goToCanonicalPage();
            return;
          }
          pushRecent(resolved.slug);
          setPlace(resolved);
          setPendingSlug(null);
        })
        .catch(goToCanonicalPage);
    },
    [pathname, pushRecent, router],
  );

  const closeSheet = useCallback(() => {
    reqRef.current++;
    activePlaceSlugRef.current = null;
    setPlace(null);
    setPendingSlug(null);
    setTravelOrigin(null);
    setMapReturnTo(null);
  }, []);

  // The provider survives App Router navigation. Close at this level so a
  // user who presses Back while the lazy sheet bundle is still loading cannot
  // have that sheet appear later over the destination page.
  useEffect(() => {
    if ((!place && !pendingSlug) || pathname === openPathRef.current) return;
    closeSheet();
  }, [closeSheet, pathname, pendingSlug, place]);

  return (
    <PlaceSheetContext.Provider value={{ openSheet, openSheetBySlug, closeSheet }}>
      {children}
      {pendingSlug ? (
        <LazySheetFallback
          label="Loading place details"
          onClose={closeSheet}
          returnFocusRef={openerRef}
          historyLayerId={historyLayerIdRef.current}
        />
      ) : place ? (
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
            travelOrigin={travelOrigin}
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
      openSheetBySlug: () => {},
      closeSheet: () => {},
    };
  }
  return ctx;
}
