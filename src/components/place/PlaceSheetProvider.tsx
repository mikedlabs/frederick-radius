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
import { haversineMeters, isInFrederickCountyArea, isValidCoord, type LngLat } from "@/lib/geo";
import LazySheetFallback from "@/components/ui/LazySheetFallback";
import { navigateAfterHistoryLayer } from "@/hooks/useReversibleHistoryLayer";
import { fetchPlaceSheetLookup } from "@/lib/place-sheet-lookup";

const PlaceSheet = lazy(() => import("./PlaceSheet"));
let placeLayerSequence = 0;

function preloadPlaceSheet() {
  void import("./PlaceSheet").catch(() => {
    // A failed speculative request must not create an unhandled page error.
    // React's lazy boundary remains the visible, retryable on-demand path.
  });
}

type InitialPlace = Pick<PlaceCardData, "slug" | "name" | "category" | "municipality" | "geom" | "open_status"> & Partial<PlaceCardData>;
type LookupOptions = {
  initialPlace?: InitialPlace;
  travelOrigin?: (LngLat & { timestamp?: number }) | null;
  returnFocus?: HTMLElement | null;
};

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
    options?: LookupOptions,
  ) => void;
  closeSheet: () => void;
};

const PlaceSheetContext = createContext<Ctx | null>(null);
const TRAVEL_ORIGIN_MAX_AGE_MS = 5 * 60_000;
const LOOKUP_CACHE_AGE_MS = 60_000;
const LOOKUP_CACHE_LIMIT = 20;

function hasPlaceIdentity(place: PlaceCardData | InitialPlace, slug: string): boolean {
  return place.slug === slug && typeof place.name === "string" && Boolean(place.name.trim())
    && typeof place.category === "string" && Boolean(place.category)
    && typeof place.municipality === "string" && Boolean(place.municipality)
    && isValidCoord(place.geom) && typeof place.open_status?.state === "string";
}

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
  const [metadataUnavailable, setMetadataUnavailable] = useState(false);
  const [travelOrigin, setTravelOrigin] = useState<LngLat | null>(null);
  const [mapReturnTo, setMapReturnTo] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const historyLayerIdRef = useRef("");
  const activePlaceSlugRef = useRef<string | null>(null);
  const openPathRef = useRef(pathname);
  // A late place lookup must not reopen a sheet after the visitor closes it,
  // follows the canonical page fallback, or taps a different place.
  const reqRef = useRef(0);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const lookupCacheRef = useRef(new Map<string, { place: PlaceCardData; at: number }>());
  const abortLookup = useCallback(() => {
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
  }, []);

  useEffect(() => () => {
    reqRef.current++;
    abortLookup();
  }, [abortLookup]);
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
      abortLookup();
      setPendingSlug(null);
      setMetadataUnavailable(false);
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
    [abortLookup, pathname, pushRecent],
  );

  const openSheetBySlug = useCallback(
    (
      slug: string,
      options?: LookupOptions,
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
      const origin = freshTravelOrigin(options?.travelOrigin === undefined ? readCachedGeoPosition() : options.travelOrigin);
      setTravelOrigin(origin);
      const withDistance = (value: PlaceCardData): PlaceCardData => ({
        ...value,
        distance_m: origin ? haversineMeters(origin, value.geom) : undefined,
      });
      activePlaceSlugRef.current = normalizedSlug;
      const req = ++reqRef.current;
      abortLookup();
      setMetadataUnavailable(false);
      const controller = new AbortController();
      lookupAbortRef.current = controller;
      const cached = lookupCacheRef.current.get(normalizedSlug);
      if (cached && Date.now() - cached.at >= 0 && Date.now() - cached.at < LOOKUP_CACHE_AGE_MS) {
        lookupAbortRef.current = null;
        setPlace(withDistance(cached.place));
        setPendingSlug(null);
        pushRecent(normalizedSlug);
        return;
      }
      lookupCacheRef.current.delete(normalizedSlug);
      const initial = options?.initialPlace;
      const knownInitial = initial && hasPlaceIdentity(initial, normalizedSlug) ? initial : null;
      // A known map pin supplies immediate identity, never authoritative metadata.
      setPlace(knownInitial ? withDistance(knownInitial as PlaceCardData) : null);
      setPendingSlug(normalizedSlug);
      const isCurrentLookup = () => reqRef.current === req
        && activePlaceSlugRef.current === normalizedSlug
        && !controller.signal.aborted
        && window.location.pathname === openPathRef.current;

      const recoverLookup = () => {
        if (!isCurrentLookup()) return;
        if (knownInitial) {
          // Offline browsing keeps the useful pin and the existing history layer.
          // Missing metadata is not permission to try provider enrichment instead.
          setPendingSlug(null);
          setMetadataUnavailable(true);
          return;
        }
        activePlaceSlugRef.current = null;
        setPlace(null);
        setPendingSlug(null);
        setTravelOrigin(null);
        setMapReturnTo(null);
        navigateAfterHistoryLayer(historyLayerId, () => {
          router.push(withBrowseReturnTo(`/places/${encodeURIComponent(normalizedSlug)}`, returnTo));
        });
      };

      fetchPlaceSheetLookup(normalizedSlug, controller.signal)
        .then((resolved) => {
          if (!isCurrentLookup()) return;
          if (!resolved || !hasPlaceIdentity(resolved, normalizedSlug)) {
            recoverLookup();
            return;
          }
          lookupCacheRef.current.set(normalizedSlug, { place: resolved, at: Date.now() });
          if (lookupCacheRef.current.size > LOOKUP_CACHE_LIMIT) {
            lookupCacheRef.current.delete(lookupCacheRef.current.keys().next().value!);
          }
          pushRecent(resolved.slug);
          setPlace(withDistance(resolved));
          setPendingSlug(null);
        })
        .catch(recoverLookup)
        .finally(() => {
          if (lookupAbortRef.current === controller) lookupAbortRef.current = null;
        });
    },
    [abortLookup, pathname, pushRecent, router],
  );

  const closeSheet = useCallback(() => {
    reqRef.current++;
    abortLookup();
    activePlaceSlugRef.current = null;
    setPlace(null);
    setPendingSlug(null);
    setMetadataUnavailable(false);
    setTravelOrigin(null);
    setMapReturnTo(null);
  }, [abortLookup]);

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
      {pendingSlug && !place ? (
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
            metadataPending={Boolean(pendingSlug)}
            metadataUnavailable={metadataUnavailable}
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
