"use client";

import { useLayoutEffect } from "react";
import { smoothFocus } from "./constants";
import { countyFitPadding } from "./mapCameraHelpers";
import { consumeInitialPlaceCameraFocus } from "./mapInitialSelection";

type FocusMap = Parameters<typeof smoothFocus>[0] & {
  getContainer: () => HTMLElement;
};
type FocusPlace = {
  slug: string;
  geom: { lng: number; lat: number };
};

/** A bare cold place link focuses its visible canonical pin once, after the
 * card commits. Existing camera owners and later user intent always win. */
export function useInitialPlaceCameraFocus({
  pending,
  ready,
  selectedPlace,
  getMap,
  hasEntryCamera,
  hasUserCameraIntent,
  hasOtherCameraOwner,
  markCameraIntent,
}: {
  pending: { current: string | null };
  ready: boolean;
  selectedPlace: FocusPlace | null;
  getMap: () => FocusMap | null;
  hasEntryCamera: boolean;
  hasUserCameraIntent: () => boolean;
  hasOtherCameraOwner: () => boolean;
  markCameraIntent: () => void;
}) {
  useLayoutEffect(() => {
    if (!pending.current || !ready || selectedPlace?.slug !== pending.current) return;
    const map = getMap();
    const card = map?.getContainer().closest(".dock-host")
      ?.querySelector<HTMLElement>(".map-peek[data-map-result-surface]");
    if (!map || !card) return;
    if (!consumeInitialPlaceCameraFocus(pending, {
      selectedSlug: selectedPlace.slug,
      liveSearch: window.location.search,
      hasEntryCamera,
      hasUserCameraIntent: hasUserCameraIntent(),
      hasOtherCameraOwner: hasOtherCameraOwner(),
    })) return;
    const padding = countyFitPadding(true, card.getBoundingClientRect().top);
    markCameraIntent();
    smoothFocus(map, [selectedPlace.geom.lng, selectedPlace.geom.lat], {
      minZoom: 15,
      maxStep: Math.max(6, 15 - map.getZoom()),
      padding,
    });
  }, [getMap, hasEntryCamera, hasOtherCameraOwner, hasUserCameraIntent, markCameraIntent, pending, ready, selectedPlace]);
}
