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
import { getScope, setScope, SCOPE_PARAM } from "@/lib/scope";
import { replaceMapUrl } from "@/lib/map-url-state";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/track";
import { isInFrederickCounty } from "./constants";
import {
  readMapLocationIntroDismissed,
  rememberMapLocationIntroDismissed,
  shouldShowMapLocationIntro,
} from "./mapLocationIntro";

export function useMapLocation({
  isBrowseMap,
  rankingSeed,
  autoFitNearbyScope,
  setGeoMsg,
  markCameraIntent,
  fitNearbyCamera,
  fitNearbyWithIntent,
  fitCountyCamera,
  onBeforeNearMe,
}: {
  isBrowseMap: boolean;
  rankingSeed: LngLat | null;
  /** A direct `in=nearme` route should honor its one-mile promise when the
   * browser has already granted location, without opening a new prompt. */
  autoFitNearbyScope: boolean;
  setGeoMsg: (message: string | null) => void;
  /** Flag the coming camera move as user-intended (the leash keeps it). */
  markCameraIntent: () => void;
  /** Fit the one-mile reach around a fix, when the map exists. */
  fitNearbyCamera: (loc: LngLat) => void;
  /** Near me's instant path: mark intent AND fit, only if the map exists. */
  fitNearbyWithIntent: (loc: LngLat) => void;
  /** Return to the county frame after a failed/out-of-county locate. */
  fitCountyCamera: () => void;
  /** Reset the results-here control and gesture refs before Near me runs. */
  onBeforeNearMe: () => void;
}): {
  userLoc: LngLat | null;
  userAccuracyM: number | null;
  locationFixTimestamp: number | null;
  locationAvailability: "available" | "requestable" | "unavailable";
  showLocationIntro: boolean;
  dismissLocationIntro: () => void;
  locating: boolean;
  goNearMe: () => void;
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
  const locateRequestedRef = useRef(false);
  const automaticNearbyRequestedRef = useRef(
    autoFitNearbyScope && rankingSeed === null,
  );
  const automaticLocationCheckRef = useRef(false);
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
      // scope here without issuing a second browser request.
      if (
        inCounty &&
        cached &&
        getScope() === "nearme" &&
        !locateRequestedRef.current
      ) {
        markCameraIntent();
        fitNearbyCamera(cached);
      }
    };
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, syncRankingLocation);
    return () =>
      window.removeEventListener(GEOLOCATION_CHANGE_EVENT, syncRankingLocation);
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

    locateRequestedRef.current = false;
    automaticNearbyRequestedRef.current = false;
    if (explicitLocateRequested) setLocating(false);

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
        setUserLoc(null);
        setUserAccuracyM(null);
        setLocationFixTimestamp(null);
        const nearbyLensActive =
          isBrowseMap &&
          (getScope() === "nearme" || automaticNearbyRequested);
        setGeoMsg(
          nearbyLensActive
            ? "You are outside Frederick County. Showing the whole county."
            : "You are outside Frederick County. Keeping your current map view.",
        );
        if (nearbyLensActive) {
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
      fitNearbyCamera(loc);
      return;
    }

    const nearbyLensActive =
      isBrowseMap &&
      (getScope() === "nearme" || automaticNearbyRequested);
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
    if (locateRequestedRef.current) return;
    onBeforeNearMe();
    // A fresh cached/shared fix makes Near me instant. Still ask the shared
    // geolocation hook to refresh it in the background; a newer fix will
    // simply refit the same honest one-mile area when it arrives.
    if (userLoc) fitNearbyWithIntent(userLoc);
    locateRequestedRef.current = true;
    setLocating(true);
    setGeoMsg(null);
    requestSharedGeolocation();
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
  };
}
