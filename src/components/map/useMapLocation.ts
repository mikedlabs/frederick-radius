"use client";

// The map's geolocation cluster (#77 extraction from AppMap.tsx): the
// ranking fix (userLoc + accuracy + timestamp), the silent refresh for
// returning grantees, the cross-surface GEOLOCATION_CHANGE_EVENT sync, the
// explicit locate response, direct Near me deep-link hydration, and goNearMe.
// Camera work crosses the boundary as callbacks (markCameraIntent /
// fitNearbyCamera / fitCountyCamera) so the map ref and camera-intent ref never
// leave AppMap.

import { useCallback, useEffect, useRef, useState } from "react";
import type { LngLat } from "@/lib/geo";
import {
  GEOLOCATION_CHANGE_EVENT,
  readCachedGeoPosition,
  readCachedPosition,
  useGeolocation,
} from "@/hooks/useGeolocation";
import { getScope, parseScope, setScope, subscribeScopeChange, SCOPE_PARAM, type Scope } from "@/lib/scope";
import { replaceMapUrl } from "@/lib/map-url-state";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import { isInFrederickCounty } from "./constants";
import {
  readMapLocationIntroDismissed,
  rememberMapLocationIntroDismissed,
  shouldShowMapLocationIntro,
} from "./mapLocationIntro";

/** The latched Near me arrival fit owns the camera only while it is still
 * pending: once its one-mile fit has landed, or the scope has left Near me (a
 * missing, denied or out-of-county fix falls back to the county), it releases
 * the camera so a later submitted search can frame its own results.
 *
 * The scope is read the way the arrival latch reads it: the URL's `in=` first,
 * then the stored choice. A shared `?in=nearme` link does not persist its
 * scope, so the stored value alone would release the camera too early and let
 * a search frame that the late Near me fit then displaces. */
export function nearbyArrivalFitPending({
  autoFitNearbyScope,
  fitApplied,
  search,
  storedScope,
}: {
  autoFitNearbyScope: boolean;
  fitApplied: boolean;
  /** The live map URL's query string (`window.location.search`). */
  search: string;
  storedScope: Scope | null;
}): boolean {
  const scope = parseScope(new URLSearchParams(search).get(SCOPE_PARAM)) ?? storedScope;
  return autoFitNearbyScope && !fitApplied && scope === "nearme";
}

export function useMapLocation({
  isBrowseMap,
  rankingSeed,
  autoFitNearbyScope,
  arrivalEntityOwnsCamera,
  setGeoMsg,
  markCameraIntent,
  fitNearbyCamera,
  recenterCamera,
  fitNearbyWithIntent,
  fitCountyCamera,
  onBeforeNearMe,
  onBeforeRecenter,
}: {
  isBrowseMap: boolean;
  rankingSeed: LngLat | null;
  /** A direct `in=nearme` route should honor its one-mile promise when the
   * browser has already granted location, without opening a new prompt. */
  autoFitNearbyScope: boolean;
  /** True while a place or event named in the arrival URL still holds the
   * camera (it is still open and the visitor has not moved the camera). A
   * late location fix then updates ranking without refitting Near me. */
  arrivalEntityOwnsCamera: () => boolean;
  setGeoMsg: (message: string | null) => void;
  /** Flag the coming camera move as user-intended (the leash keeps it). */
  markCameraIntent: () => void;
  /** Fit the one-mile reach around a fix, when the map exists. */
  fitNearbyCamera: (loc: LngLat) => void;
  recenterCamera: (loc: LngLat) => void;
  /** Near me's instant path: mark intent AND fit, only if the map exists. */
  fitNearbyWithIntent: (loc: LngLat) => void;
  /** Return to the county frame after a failed/out-of-county locate. */
  fitCountyCamera: () => void;
  /** Reset the results-here control and gesture refs before Near me runs. */
  onBeforeNearMe: () => void;
  /** Retire any deferred entry camera fit before a recenter requests a fix. */
  onBeforeRecenter: () => void;
}): {
  userLoc: LngLat | null;
  userAccuracyM: number | null;
  locationFixTimestamp: number | null;
  locationAvailability: "available" | "requestable" | "unavailable";
  showLocationIntro: boolean;
  dismissLocationIntro: () => void;
  locating: boolean;
  goNearMe: () => void;
  recenterOnLocation: () => void;
} {
  const [userLoc, setUserLoc] = useState<LngLat | null>(rankingSeed);
  const [userAccuracyM, setUserAccuracyM] = useState<number | null>(() => {
    const cached = readCachedGeoPosition();
    return cached && Number.isFinite(cached.accuracy) ? cached.accuracy : null;
  });
  const [locationFixTimestamp, setLocationFixTimestamp] = useState<number | null>(() =>
    readCachedGeoPosition()?.timestamp ?? null,
  );
  const [locating, setLocating] = useState(false);
  // Keep the server and hydration render identical. The persisted preference
  // is applied after mount, before the silent permission check can reveal the
  // first-use sheet on a normal cold entry.
  const [locationIntroDismissed, setLocationIntroDismissed] = useState(false);
  const [locationPermissionChecked, setLocationPermissionChecked] = useState(
    () => !isBrowseMap || rankingSeed !== null,
  );
  const {
    state: sharedGeolocationState,
    requestHighAccuracy: requestSharedGeolocation,
    requestIfGranted: refreshGrantedGeolocation,
  } = useGeolocation();
  const locateRequestedRef = useRef<"nearby" | "recenter" | null>(null);
  // A passive location refresh may still complete after Find me. Let a new
  // scope choice re-enable fitting, but keep late fixes from changing zoom.
  const recenterOwnsCameraRef = useRef(false);
  const automaticNearbyRequestedRef = useRef(
    autoFitNearbyScope && rankingSeed === null,
  );
  const automaticLocationCheckRef = useRef(false);
  // A Near me choice made after arrival (the shared header) is newer intent
  // than the place or event the arrival URL named, so its fix may refit.
  const nearMeChosenSinceMountRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setLocationIntroDismissed(readMapLocationIntroDismissed());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A returning visitor who already granted location should never have their
  // results ranked from an invisible map-center fallback. Refresh the fix
  // silently. A direct Near me route also fits that fix; other map entries
  // preserve the county overview until Locate is tapped. First-time visitors
  // are never prompted from this effect.
  useEffect(() => {
    const cached = readCachedPosition();
    if (
      !isBrowseMap ||
      automaticLocationCheckRef.current ||
      (cached && isInFrederickCounty(cached.lng, cached.lat))
    ) {
      return;
    }

    automaticLocationCheckRef.current = true;
    void refreshGrantedGeolocation().then((started) => {
      if (!started && mountedRef.current) setLocationPermissionChecked(true);
      if (
        started ||
        !mountedRef.current ||
        locateRequestedRef.current !== null ||
        !automaticNearbyRequestedRef.current
      ) {
        return;
      }

      // `in=nearme` is a promise about a real device fix. When the browser has
      // not already granted one, keep consent explicit and make the fallback
      // truthful instead of leaving a county camera labeled Near me.
      automaticNearbyRequestedRef.current = false;
      setScope("county");
      replaceMapUrl((params) => params.delete(SCOPE_PARAM));
      fitCountyCamera();
      setGeoMsg(
        "Location is not available yet. Showing the whole county. Use the location button to turn on Near me.",
      );
    });
  }, [autoFitNearbyScope, fitCountyCamera, isBrowseMap, refreshGrantedGeolocation, setGeoMsg]);

  useEffect(() => {
    if (
      sharedGeolocationState.status !== "idle" &&
      sharedGeolocationState.status !== "loading"
    ) {
      setLocationPermissionChecked(true);
    }
  }, [sharedGeolocationState.status]);

  useEffect(
    () =>
      subscribeScopeChange((nextScope) => {
        if (nextScope === "nearme") nearMeChosenSinceMountRef.current = true;
      }),
    [],
  );

  // Location can be granted from Ask, Today, or the map itself. The shared
  // same-tab event keeps map ranking current without moving the camera.
  useEffect(() => {
    const syncRankingLocation = () => {
      const cached = readCachedGeoPosition();
      const inCounty = Boolean(
        cached && isInFrederickCounty(cached.lng, cached.lat),
      );
      setUserLoc(inCounty ? cached : null);
      setUserAccuracyM(
        inCounty && cached
          ? cached.accuracy
          : null,
      );
      setLocationFixTimestamp(
        inCounty && cached
          ? cached.timestamp
          : null,
      );
      // A Near me choice made in the shared header requests location through
      // that header's hook. When its fix lands, honor the already-selected
      // scope here without issuing a second browser request. A place or
      // event named in the arrival URL takes precedence over that fit: a late
      // silent fix re-ranks results but leaves the camera on the entity.
      if (
        inCounty &&
        cached &&
        getScope() === "nearme" &&
        !recenterOwnsCameraRef.current &&
        !locateRequestedRef.current &&
        (nearMeChosenSinceMountRef.current || !arrivalEntityOwnsCamera())
      ) {
        markCameraIntent();
        fitNearbyCamera(cached);
      }
    };
    const unsubscribe = subscribeScopeChange(() => {
      recenterOwnsCameraRef.current = false;
    });
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, syncRankingLocation);
    return () => {
      unsubscribe();
      window.removeEventListener(GEOLOCATION_CHANGE_EVENT, syncRankingLocation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera callbacks are stable wrappers around AppMap refs
  }, []);

  // An explicit Locate tap may move the camera. The only automatic exception
  // is a direct `in=nearme` route, whose label and one-mile result contract
  // would otherwise disagree with a countywide camera.
  // The effect answers a change in shared geolocation state. Camera callbacks
  // are stable-by-contract wrappers around AppMap refs.
  useEffect(() => {
    const explicitLocateRequested = locateRequestedRef.current;
    const automaticNearbyRequested = automaticNearbyRequestedRef.current;
    if (!explicitLocateRequested && !automaticNearbyRequested) return;
    if (
      sharedGeolocationState.status === "idle" ||
      sharedGeolocationState.status === "loading"
    ) {
      return;
    }

    locateRequestedRef.current = null;
    automaticNearbyRequestedRef.current = false;
    if (explicitLocateRequested) setLocating(false);
    const nearbyLensActive =
      isBrowseMap &&
      (automaticNearbyRequested ||
        (explicitLocateRequested !== "recenter" && getScope() === "nearme"));

    if (sharedGeolocationState.status === "granted") {
      const loc = {
        lng: sharedGeolocationState.position.lng,
        lat: sharedGeolocationState.position.lat,
      };
      markCameraIntent();
      if (explicitLocateRequested) {
        haptic("light");
        track("map_locate", {
          in_county: isInFrederickCounty(loc.lng, loc.lat),
        });
      }

      if (!isInFrederickCounty(loc.lng, loc.lat)) {
        const shouldReturnToCounty = nearbyLensActive && explicitLocateRequested !== "recenter";
        setUserLoc(null);
        setUserAccuracyM(null);
        setLocationFixTimestamp(null);
        setGeoMsg(
          shouldReturnToCounty
            ? "You are outside Frederick County. Showing the whole county."
            : "You are outside Frederick County. Keeping your current map view.",
        );
        if (shouldReturnToCounty) {
          setScope("county");
          replaceMapUrl((params) => params.delete(SCOPE_PARAM));
          fitCountyCamera();
        }
        return;
      }

      setGeoMsg(null);
      setUserLoc(loc);
      setUserAccuracyM(sharedGeolocationState.position.accuracy);
      setLocationFixTimestamp(sharedGeolocationState.position.timestamp);
      if (explicitLocateRequested === "recenter") recenterCamera(loc);
      else fitNearbyCamera(loc);
      return;
    }

    if (nearbyLensActive) {
      // A failed permission request cannot leave a shareable `in=nearme`
      // promise in the URL or dock. Fall back to the actual county frame and
      // let the shared-scope event update MapDock's header immediately.
      setScope("county");
      replaceMapUrl((params) => params.delete(SCOPE_PARAM));
      fitCountyCamera();
    }
    setGeoMsg(
      sharedGeolocationState.status === "denied"
        ? nearbyLensActive
          ? "Location is off. Showing the whole county. Enable it in your browser to use Near me."
          : "Location is off. Enable it in your browser to recenter the map."
        : nearbyLensActive
          ? "Couldn't get your location. Showing the whole county."
          : "Couldn't get your location. Keeping your current map view.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera callbacks are stable wrappers around AppMap refs
  }, [isBrowseMap, sharedGeolocationState]);

  const dismissLocationIntro = useCallback(() => {
    setLocationIntroDismissed(true);
    rememberMapLocationIntroDismissed();
  }, []);

  const goNearMe = () => {
    dismissLocationIntro();
    if (isBrowseMap && getScope() !== "nearme") {
      setScope("nearme");
      replaceMapUrl((params) => params.set(SCOPE_PARAM, "nearme"));
    }
    if (locateRequestedRef.current === "nearby") return;
    const alreadyRequested = locateRequestedRef.current === "recenter";
    locateRequestedRef.current = "nearby";
    recenterOwnsCameraRef.current = false;
    onBeforeNearMe();
    // A fresh cached/shared fix makes Near me instant. Still ask the shared
    // geolocation hook to refresh it in the background; a newer fix will
    // simply refit the same honest one-mile area when it arrives.
    if (userLoc) fitNearbyWithIntent(userLoc);
    if (alreadyRequested) return;
    setLocating(true);
    setGeoMsg(null);
    requestSharedGeolocation();
  };

  const recenterOnLocation = () => {
    dismissLocationIntro();
    if (locateRequestedRef.current) return;
    locateRequestedRef.current = "recenter";
    recenterOwnsCameraRef.current = true;
    onBeforeRecenter();
    if (userLoc) {
      markCameraIntent();
      recenterCamera(userLoc);
    }
    setLocating(true);
    setGeoMsg(null);
    if (sharedGeolocationState.status !== "loading") requestSharedGeolocation();
  };

  const locationAvailability = userLoc
    ? "available"
    : sharedGeolocationState.status === "denied" ||
        sharedGeolocationState.status === "unavailable"
      ? "unavailable"
      : "requestable";
  const showLocationIntro = shouldShowMapLocationIntro({
    isBrowseMap,
    permissionChecked: locationPermissionChecked,
    hasLocation: Boolean(userLoc),
    availability: locationAvailability,
    dismissed: locationIntroDismissed,
  });

  return {
    userLoc,
    userAccuracyM,
    locationFixTimestamp,
    locationAvailability,
    showLocationIntro,
    dismissLocationIntro,
    locating,
    goNearMe,
    recenterOnLocation,
  };
}
