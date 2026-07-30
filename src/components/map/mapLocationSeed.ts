import type { LngLat } from "@/lib/geo";
import { isInFrederickCounty } from "./constants";

export type CachedMapLocation = LngLat & {
  /** The current map route has no explicit camera or town to preserve. */
  preferMapCamera?: boolean;
};

export type MapLocationSeed = {
  /** A fresh consented fix can rank results without moving the camera. */
  ranking: LngLat | null;
  /** Camera movement requires route intent or a clean map-camera hint. */
  camera: LngLat | null;
};

/**
 * Keep location trust separate from camera intent. Every fresh county fix may
 * rank results. It moves the opening camera only when the route opts in, or
 * when readCachedPosition marks a clean /map route with no camera/town promise.
 */
export function resolveMapLocationSeed(
  cached: CachedMapLocation | null,
  recenterToKnownLocation: boolean,
): MapLocationSeed {
  const ranking =
    cached && isInFrederickCounty(cached.lng, cached.lat) ? cached : null;
  const cameraRequested =
    recenterToKnownLocation || cached?.preferMapCamera === true;

  return {
    ranking,
    camera: cameraRequested ? ranking : null,
  };
}
