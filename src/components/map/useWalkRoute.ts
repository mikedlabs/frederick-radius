"use client";

// Routed walk time + directions readout for the selected place (#77
// extraction from AppMap.tsx). Real walking minutes for the SELECTED place
// only (Mapbox Directions via /api/walk-time — never fetched per pin). The
// chip renders the straight-line estimate immediately and swaps the routed
// figure in place when it lands: same slot, no spinner, no layout shift. The
// tilde is the honesty marker — "~4 min walk" is the estimate, "5 min walk"
// is the routed truth. Gated on a real geolocation fix plus walkable range
// (shouldFetchWalkTime); reselecting aborts the in-flight fetch, and the
// slug key drops any stale late response. The routeGeoJson build and the
// searchRouteRef mirror stay in AppMap.

import { useEffect, useMemo, useState } from "react";
import {
  formatDistance,
  haversineMeters,
  metersToMinutes,
  type LngLat,
} from "@/lib/geo";
import {
  WALK_LABEL_MAX_METERS,
  shouldFetchWalkTime,
  walkTimeQuery,
  type WalkRouteCoordinates,
  type WalkTimeResponse,
} from "@/lib/walkTime";

export type RealWalk = {
  slug: string;
  minutes: number;
  meters: number | null;
  coordinates?: WalkRouteCoordinates;
};

export type RouteInfo = {
  dist: string;
  eta: string;
  href: string;
  name: string;
};

type SelectedPlaceLike = {
  slug: string;
  name: string;
  geom: { lng: number; lat: number };
} | null;

export function useWalkRoute(
  userLoc: LngLat | null,
  selectedPlace: SelectedPlaceLike,
): { realWalk: RealWalk | null; routedWalkActive: boolean; routeInfo: RouteInfo | null } {
  const [realWalk, setRealWalk] = useState<RealWalk | null>(null);
  useEffect(() => {
    // The stale-route reset predates this extraction (AppMap ran the same
    // line; its size bailed the compiler lint there). Kept byte-identical —
    // the refactor's contract is zero behavior change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRealWalk(null);
    if (!userLoc || !selectedPlace) return;
    if (!shouldFetchWalkTime(haversineMeters(userLoc, selectedPlace.geom))) return;
    const slug = selectedPlace.slug;
    const ctrl = new AbortController();
    fetch(
      `/api/walk-time?${walkTimeQuery(userLoc, selectedPlace.geom, { geometry: true })}`,
      { signal: ctrl.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WalkTimeResponse | null) => {
        if (d?.ok && d.minutes >= 1) {
          setRealWalk({
            slug,
            minutes: Math.round(d.minutes),
            meters: d.meters,
            coordinates: d.coordinates,
          });
        }
      })
      .catch(() => {
        /* aborted or offline — the straight-line estimate stands */
      });
    return () => ctrl.abort();
  }, [userLoc, selectedPlace]);

  const routedWalkActive =
    Boolean(
      selectedPlace &&
        realWalk?.slug === selectedPlace.slug &&
        realWalk.coordinates &&
        realWalk.coordinates.length >= 2,
    );

  const routeInfo = useMemo(() => {
    if (!userLoc || !selectedPlace) return null;
    const m = haversineMeters(userLoc, selectedPlace.geom);
    // Honest mode for the estimate: downtown the answer is a WALK ("~1 min
    // drive" for a place 300m away read as parody). Under ~800m show walk
    // minutes; beyond that, drive.
    const walkable = m <= WALK_LABEL_MAX_METERS;
    const mins = Math.max(1, Math.round(metersToMinutes(walkable ? "walk" : "drive", m)));
    const routedMin =
      walkable && realWalk && realWalk.slug === selectedPlace.slug ? realWalk.minutes : null;
    return {
      dist: formatDistance(
        routedMin != null && realWalk?.meters != null ? realWalk.meters : m,
      ),
      eta: routedMin != null ? `${routedMin} min walk` : `~${mins} min ${walkable ? "walk" : "drive"}`,
      href: `https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.geom.lat},${selectedPlace.geom.lng}`,
      name: selectedPlace.name,
    };
  }, [userLoc, selectedPlace, realWalk]);

  return { realWalk, routedWalkActive, routeInfo };
}
