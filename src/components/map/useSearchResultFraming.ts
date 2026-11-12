"use client";

import { useEffect } from "react";
import type { LngLat } from "@/lib/geo";
import { mapCameraDuration } from "@/lib/motion";
import { CAM_EASE, smoothFocus } from "./constants";
import { countyFitPadding } from "./mapCameraHelpers";
import type { MapTaskListRow } from "./mapListTask";
import { searchResultFrame } from "./searchResultFrame";

type FrameMap = Parameters<typeof smoothFocus>[0] & {
  fitBounds(
    bounds: [[number, number], [number, number]],
    options: {
      padding: ReturnType<typeof countyFitPadding>;
      maxZoom: number;
      duration: number;
      easing: (t: number) => number;
      essential: boolean;
    },
  ): unknown;
};

export type SearchFrameRequest = { key: string; expiresAt: number };

/** How long a submitted search may take to settle before framing is dropped. */
export const SEARCH_FRAME_TTL_MS = 8_000;

export function searchFrameRequest(key: string, now = Date.now()): SearchFrameRequest {
  return { key, expiresAt: now + SEARCH_FRAME_TTL_MS };
}

/** The request key for a search that resolved to a category intent. */
export function intentFrameKey(intentKey: string, subKey?: string | null): string {
  return `intent:${intentKey}/${subKey ?? ""}`;
}

/** The request key a map URL carries on arrival, or null. A camera in the
 * URL, or a named place or event, owns the arrival frame instead. */
export function arrivalSearchFrameKey(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.has("c") || params.get("place") || params.get("event")) return null;
  const q = (params.get("q") ?? "").trim();
  if (q.length >= 2) return `q:${q.slice(0, 160)}`;
  const intent = params.get("intent");
  return intent ? intentFrameKey(intent, params.get("sub")) : null;
}

/** The request key for a URL search that replaced the map's own query while
 * the map stayed mounted (Find, Back, another search link), or null. The
 * map's typing and its dock chips update the live query before they write the
 * URL, so they never re-arm framing and a chip toggle never moves the camera. */
export function navigatedSearchFrameKey(search: string, liveQuery: string): string | null {
  const routeQuery = (new URLSearchParams(search).get("q") ?? "").slice(0, 160);
  if (routeQuery.trim() === liveQuery.trim()) return null;
  return arrivalSearchFrameKey(search);
}

/** The points that decide a search frame, in the result list's own ranking.
 * Rows without coordinates (an event link) are skipped. */
export function searchFramePointsFromRows(rows: readonly MapTaskListRow[] | null | undefined): LngLat[] {
  return (rows ?? []).flatMap((row): LngLat[] =>
    row.kind === "place" ? [row.place.geom]
      : row.kind === "event" ? [{ lng: row.event.lng, lat: row.event.lat }]
        : []);
}

/**
 * Frame the results of one submitted search, once.
 *
 * `pendingRef` holds the request key ("q:coffee", "intent:eat/") set when a
 * search is submitted or arrives in the URL. When the settled result set for
 * that same key is ready, the camera fits its leading results and the request
 * is consumed. A gesture after the submission or another camera owner (a
 * scene, Near me fitting, an entity link) cancels it, so the visitor's own
 * camera always wins. A request that never settles expires, so a later chip
 * toggle that lands on the same key cannot move the camera.
 */
export function useSearchResultFraming({
  pendingRef,
  settledKey,
  points,
  ready,
  getMap,
  hasUserGestureSincePending,
  hasOtherCameraOwner,
  markCameraIntent,
}: {
  pendingRef: { current: SearchFrameRequest | null };
  settledKey: string | null;
  points: readonly LngLat[];
  ready: boolean;
  getMap: () => FrameMap | null;
  hasUserGestureSincePending: () => boolean;
  hasOtherCameraOwner: () => boolean;
  markCameraIntent: () => void;
}) {
  useEffect(() => {
    const request = pendingRef.current;
    if (!request || !ready) return;
    if (Date.now() > request.expiresAt || hasUserGestureSincePending() || hasOtherCameraOwner()) {
      pendingRef.current = null;
      return;
    }
    if (settledKey !== request.key || points.length === 0) return;
    const map = getMap();
    if (!map) return;
    pendingRef.current = null;
    const frame = searchResultFrame(points);
    if (!frame) return;
    markCameraIntent();
    if (frame.kind === "point") {
      smoothFocus(map, frame.center, { minZoom: 15, maxStep: Math.max(6, 15 - map.getZoom()), padding: countyFitPadding() });
      return;
    }
    map.fitBounds(frame.bounds, {
      padding: countyFitPadding(),
      maxZoom: 16,
      duration: mapCameraDuration("reframe"),
      easing: CAM_EASE,
      essential: true,
    });
  }, [getMap, hasOtherCameraOwner, hasUserGestureSincePending, markCameraIntent, pendingRef, points, ready, settledKey]);
}
