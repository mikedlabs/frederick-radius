import type { LngLat } from "@/lib/geo";
import { isInFrederickCounty } from "./constants";

export type MapLocationSeed = {
  /** A fresh consented fix can rank results without moving the camera. */
  ranking: LngLat | null;
  /** Camera movement remains an explicit route-level choice. */
  camera: LngLat | null;
};

/**
 * Keep the two location decisions separate. A cached fix should make search
 * and distance labels local on every map visit, while only routes that
 * explicitly opt in may open the camera on that fix.
 */
export function resolveMapLocationSeed(
  cached: LngLat | null,
  recenterToKnownLocation: boolean,
): MapLocationSeed {
  const ranking =
    cached && isInFrederickCounty(cached.lng, cached.lat) ? cached : null;

  return {
    ranking,
    camera: recenterToKnownLocation ? ranking : null,
  };
}
