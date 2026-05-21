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
 * A coordinate is "valid" for the app when it has finite numbers AND
 * lands inside the county bbox. (0, 0) or any default fallback fails
 * by construction. Callers use this at loader boundaries to drop
 * mis-positioned rows from public surfaces.
 */
export function isValidCoord(coord: { lng: number; lat: number } | null | undefined): boolean {
  if (!coord) return false;
  return isInsideFrederickCounty(coord.lat, coord.lng);
}
