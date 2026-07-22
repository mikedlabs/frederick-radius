import { isInFrederickCountyArea } from "@/lib/geo";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * The historic source includes out-of-county reference points. Keep the raw
 * archival pull intact on disk, but never serve those rows as Frederick County
 * discoveries. Invalid geometry is dropped rather than guessed.
 */
export function scopeHistoricOverlay(raw: unknown): GeoJSON.FeatureCollection {
  if (!raw || typeof raw !== "object") return EMPTY;
  const features = (raw as { features?: unknown }).features;
  if (!Array.isArray(features)) return EMPTY;

  return {
    type: "FeatureCollection",
    features: features.filter((candidate): candidate is GeoJSON.Feature => {
      if (!candidate || typeof candidate !== "object") return false;
      const geometry = (candidate as { geometry?: unknown }).geometry;
      if (!geometry || typeof geometry !== "object") return false;
      const point = geometry as { type?: unknown; coordinates?: unknown };
      if (point.type !== "Point" || !Array.isArray(point.coordinates)) return false;
      const [lng, lat] = point.coordinates;
      return typeof lng === "number" && typeof lat === "number" && isInFrederickCountyArea(lng, lat);
    }),
  };
}
