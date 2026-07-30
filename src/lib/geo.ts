import COUNTY_RING from "@/data/county-ring.json";

export type LngLat = { lng: number; lat: number };

export const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const WALKING_MPS = 1.25;
export const BIKING_MPS = 4.17;
export const DRIVING_URBAN_MPS = 11.11;

export type TravelMode = "walk" | "bike" | "drive" | "distance";

export function minutesToMeters(mode: TravelMode, minutes: number): number {
  switch (mode) {
    case "walk": return Math.round(minutes * 60 * WALKING_MPS);
    case "bike": return Math.round(minutes * 60 * BIKING_MPS);
    case "drive": return Math.round(minutes * 60 * DRIVING_URBAN_MPS);
    case "distance": return Math.round(minutes);
  }
}

export function metersToMinutes(mode: TravelMode, meters: number): number {
  const mps =
    mode === "walk" ? WALKING_MPS :
    mode === "bike" ? BIKING_MPS :
    mode === "drive" ? DRIVING_URBAN_MPS : WALKING_MPS;
  return Math.round(meters / mps / 60);
}

export function formatDistance(meters: number, unit: "mi" | "km" | "auto" = "auto"): string {
  const useMi = unit === "mi" || (unit === "auto" && true);
  if (useMi) {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round(meters * 3.281)} ft`;
    return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

export function bboxOf(center: LngLat, meters: number): [number, number, number, number] {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos(toRad(center.lat)));
  return [center.lng - dLng, center.lat - dLat, center.lng + dLng, center.lat + dLat];
}

export const FREDERICK_CENTER: LngLat = { lng: -77.4105, lat: 39.4143 };

/**
 * Frederick County bounding box. Used to validate that every coordinate
 * we render or save actually lives in the county. A mispositioned
 * marker breaks trust instantly, so any point that lands outside this
 * box is mis-geocoded by definition and gets flagged needs_review
 * instead of rendered.
 *
 * The FrederickRadius brief gives "39.32–39.72" for the south/north
 * bounds, but that crops Brunswick, Knoxville, and Point of Rocks —
 * actual Frederick County extends south to ~39.27. These wider bounds
 * match the existing FREDERICK_COUNTY_BBOX constant in
 * src/lib/integrations/overpass.ts that already shapes our OSM,
 * Mapillary, Ticketmaster, and Bandsintown fetches, so coordinate
 * validation and data ingestion now agree on what "in the county" means.
 */
export const FREDERICK_COUNTY_BBOX = {
  south: 39.265,
  west: -77.700,
  north: 39.745,
  east: -77.150,
};

export function isInsideFrederickCounty(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= FREDERICK_COUNTY_BBOX.south &&
    lat <= FREDERICK_COUNTY_BBOX.north &&
    lng >= FREDERICK_COUNTY_BBOX.west &&
    lng <= FREDERICK_COUNTY_BBOX.east
  );
}

/**
 * The real county outline, simplified from the public-domain U.S. Census
 * TIGERweb boundary. The bbox test above passes places in Washington and
 * Carroll County (Smithsburg sits inside the box but 8km outside the
 * county), which let 79 out-of-county records survive into discovery
 * surfaces. The 2026-06 redesign audit caught a Smithsburg bar served
 * as the guide's "Best match" for a downtown Frederick user.
 */
const RING: ReadonlyArray<readonly [number, number]> = COUNTY_RING as [number, number][];

function pointInCountyRing(lng: number, lat: number): boolean {
  let inside = false;
  let j = RING.length - 1;
  for (let i = 0; i < RING.length; i++) {
    const [xi, yi] = RING[i];
    const [xj, yj] = RING[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

/** Distance in meters from a point to the nearest simplified-ring vertex.
 *  The boundary buffer absorbs the small simplification error. */
function metersToRing(lng: number, lat: number): number {
  let best = Infinity;
  const mLat = 111320;
  const mLng = 111320 * Math.cos((lat * Math.PI) / 180);
  for (const [vlng, vlat] of RING) {
    const d = Math.hypot((vlat - lat) * mLat, (vlng - lng) * mLng);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Polygon-accurate county membership with a 1.5km buffer. The buffer
 * exists because member municipalities straddle the line: Mount Airy's
 * Main Street is partly in Carroll County and belongs here; a Boonsboro
 * coffee shop 5km past the ridge does not. Buffer chosen so every
 * straddling Main Street survives and every true foreigner dies.
 */
export function isInFrederickCountyArea(lng: number, lat: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // Fast-path rejector: the bbox padded by ~2km so the straddle buffer
  // still works at the bbox edges (Mount Airy's Carroll-side block sits
  // 200m past the unpadded eastern bound).
  const PAD = 0.02;
  if (
    lat < FREDERICK_COUNTY_BBOX.south - PAD ||
    lat > FREDERICK_COUNTY_BBOX.north + PAD ||
    lng < FREDERICK_COUNTY_BBOX.west - PAD ||
    lng > FREDERICK_COUNTY_BBOX.east + PAD
  ) {
    return false;
  }
  if (pointInCountyRing(lng, lat)) return true;
  return metersToRing(lng, lat) <= 1500;
}

/**
 * A coordinate is "valid" for the app when it has finite numbers AND
 * lands inside the county (real outline plus a 1.5km straddle buffer,
 * not just the bbox). (0, 0) or any default fallback fails by
 * construction. Callers use this at loader boundaries to drop
 * mis-positioned rows from public surfaces.
 */
export function isValidCoord(coord: { lng: number; lat: number } | null | undefined): boolean {
  if (!coord) return false;
  return isInFrederickCountyArea(coord.lng, coord.lat);
}
