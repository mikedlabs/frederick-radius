/**
 * location.ts — point → municipality utilities.
 *
 * Extracted from `lib/connect.ts` so client surfaces (useGeolocation,
 * any future "where am I" UI) can import these pure functions WITHOUT
 * pulling in `lib/connect`'s top-level static import of
 * `places-client.json` (~2MB). The connectivity layer still needs
 * those functions for the nearbyNow join; it imports them from here
 * too so the implementation stays single-sourced.
 *
 * Pure and isomorphic — no network, no clock, no DOM. Deterministic
 * given a point + the static MUNICIPALITIES table.
 */

import { MUNICIPALITIES, type Municipality } from "@/data/municipalities";
import {
  haversineMeters,
  isInFrederickCountyArea,
  type LngLat,
} from "@/lib/geo";

export type MunicipalityHit = {
  municipality: Municipality;
  /** True when the point falls inside the municipality's bbox. */
  inside: boolean;
  /** Great-circle metres from the point to the municipality centroid. */
  distance_m: number;
};

function inBbox(p: LngLat, bbox: [number, number, number, number]): boolean {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return p.lng >= minLng && p.lng <= maxLng && p.lat >= minLat && p.lat <= maxLat;
}

/**
 * Resolve a coordinate to one of the county's 12 municipalities.
 *
 * Containment wins: if the point is inside exactly one bbox we return it
 * with `inside:true`. Bboxes can overlap at the seams (Mount Airy sits in
 * four counties); when several contain the point we keep the one whose
 * centroid is closest, which is the correct disambiguation for a user
 * standing near a town line. With no containing bbox we fall back to the
 * nearest centroid so the function is total — every point in (and near)
 * the county resolves to something, never null.
 *
 * Pure: depends only on the static MUNICIPALITIES table. No network, no
 * reverse-geocode API, no key, works offline and on the server.
 */
export function resolveMunicipality(point: LngLat): MunicipalityHit {
  let containing: MunicipalityHit | null = null;
  let nearest: MunicipalityHit | null = null;

  for (const m of MUNICIPALITIES) {
    const distance_m = haversineMeters(point, m.centroid);
    if (!nearest || distance_m < nearest.distance_m) {
      nearest = { municipality: m, inside: false, distance_m };
    }
    if (inBbox(point, m.bbox)) {
      if (!containing || distance_m < containing.distance_m) {
        containing = { municipality: m, inside: true, distance_m };
      }
    }
  }

  // nearest is never null: MUNICIPALITIES is a non-empty const.
  return containing ?? nearest!;
}

/**
 * Catalog-safe municipality resolution.
 *
 * resolveMunicipality() is intentionally total for user-location labels, so
 * even Baltimore has a "nearest" Frederick municipality. Ingestion must not
 * use that behavior: a source row first has to clear the county outline, then
 * and only then may it receive a municipality. This nullable variant makes
 * that ordering explicit and prevents a neighboring-county business from
 * silently wearing the nearest Frederick town label.
 */
export function resolveFrederickMunicipality(
  point: LngLat,
): MunicipalityHit | null {
  if (!isInFrederickCountyArea(point.lng, point.lat)) return null;
  return resolveMunicipality(point);
}

/**
 * A short, honest location label for the geolocation chip and headers.
 * Inside a town → "Frederick, MD". Outside but close → "Near Thurmont".
 * Far from every centroid → "Frederick County, MD" (generic but true —
 * the app's whole footprint is the county).
 */
export function locationLabel(point: LngLat): string {
  const hit = resolveMunicipality(point);
  if (hit.inside) return `${hit.municipality.name}, MD`;
  if (hit.distance_m <= 8_000) return `Near ${hit.municipality.name}`;
  return "Frederick County, MD";
}
