"use client";

// The map's geolocation cluster (#77 extraction from AppMap.tsx): the
// ranking fix (userLoc + accuracy + timestamp), the silent refresh for
// returning grantees, the cross-surface GEOLOCATION_CHANGE_EVENT sync, the
// explicit locate response (the only path allowed to move the camera), and
// goNearMe. Logic is byte-identical to the inline original. Camera work
// crosses the boundary as callbacks (markCameraIntent / fitNearbyCamera /
// fitCountyCamera) so the map ref and camera-intent ref never leave AppMap.

import { useEffect, useRef, useState } from "react";
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

export function useMapLocation({
  isBrowseMap,
  rankingSeed,
  setGeoMsg,
  markCameraIntent,
  fitNearbyCamera,
  fitNearbyWithIntent,
  fitCountyCamera,
  onBeforeNearMe,
}: {
  isBrowseMap: boolean;
  rankingSeed: LngLat | null;
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
  const {
    state: sharedGeolocationState,
    requestHighAccuracy: requestSharedGeolocation,
    requestIfGranted: refreshGrantedGeolocation,
  } = useGeolocation();
  const locateRequestedRef = useRef(false);
  const automaticLocationCheckRef = useRef(false);

  // A returning visitor who already granted location should never have their
  // results ranked from an invisible map-center fallback. Refresh the fix
  // silently, but preserve the county overview until they explicitly tap the
  // locate control. First-time visitors are never prompted from this effect.
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
    void refreshGrantedGeolocation();
  }, [isBrowseMap, refreshGrantedGeolocation]);

  // Location can be granted from Ask, Today, or the map itself. The shared
  // same-tab event keeps map ranking current without moving the camera.
  useEffect(() => {
    const syncRankingLocation = () => {
      const cached = readCachedGeoPosition();
      setUserLoc(
        cached && isInFrederickCounty(cached.lng, cached.lat) ? cached : null,
      );
      setUserAccuracyM(
        cached && isInFrederickCounty(cached.lng, cached.lat)
          ? cached.accuracy
          : null,
      );
      setLocationFixTimestamp(
        cached && isInFrederickCounty(cached.lng, cached.lat)
          ? cached.timestamp
          : null,
      );
    };
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, syncRankingLocation);
    return () =>
      window.removeEventListener(GEOLOCATION_CHANGE_EVENT, syncRankingLocation);
  }, []);

  // Only an explicit tap on Locate may move the camera. Hook hydration can
  // update ranking silently, but it never enters this branch.
  // Dependencies match the inline original exactly: the effect answers a
  // change in the shared geolocation state, and the camera callbacks are
  // stable-by-contract wrappers around AppMap refs.
  useEffect(() => {
    if (!locateRequestedRef.current) return;
    if (
      sharedGeolocationState.status === "idle" ||
      sharedGeolocationState.status === "loading"
    ) {
      return;
    }

    locateRequestedRef.current = false;
    setLocating(false);

    if (sharedGeolocationState.status === "granted") {
      const loc = {
        lng: sharedGeolocationState.position.lng,
        lat: sharedGeolocationState.position.lat,
      };
      markCameraIntent();
      haptic("light");
      track("map_locate", {
        in_county: isInFrederickCounty(loc.lng, loc.lat),
      });

      if (!isInFrederickCounty(loc.lng, loc.lat)) {
        setUserLoc(null);
        setUserAccuracyM(null);
        setLocationFixTimestamp(null);
        const nearbyLensActive = isBrowseMap && getScope() === "nearme";
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

    const nearbyLensActive = isBrowseMap && getScope() === "nearme";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- byte-identical extraction (#77): the camera callbacks wrap AppMap refs
  }, [isBrowseMap, sharedGeolocationState]);

  const goNearMe = () => {
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

  return { userLoc, userAccuracyM, locationFixTimestamp, locating, goNearMe };
}
