/**
 * Client-safe contract for the City of Frederick mobility overlay.
 *
 * The City services are useful only when they are queried around the area a
 * person is actually inspecting. These limits keep a shared URL, a very wide
 * desktop viewport, or a hand-edited request from turning into a city-wide
 * geometry download.
 */

export type CityMobilityBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export const CITY_MOBILITY_EXTENT: CityMobilityBounds = {
  west: -77.49,
  south: 39.35,
  east: -77.33,
  north: 39.51,
};

// The map's one-mile Near me fit settles around 12.68 on a 390px phone once
// the bottom instrument is included in camera padding. Start just below that
// honest mobile camera; the viewport-size limits below still prevent a wide
// desktop or county view from requesting dense City geometry.
export const CITY_MOBILITY_MIN_ZOOM = 12.5;
export const CITY_MOBILITY_MAX_WIDTH_DEGREES = 0.18;
export const CITY_MOBILITY_MAX_HEIGHT_DEGREES = 0.18;
export const CITY_MOBILITY_MAX_AREA_DEGREES = 0.0125;
export const CITY_MOBILITY_MAX_RADIUS_METERS = 4_000;
export const CITY_MOBILITY_MAX_STREET_AREA_DEGREES = 0.0025;

export type CityMobilitySourceStatus = "current" | "stale" | "unavailable";
export type CityMobilityCoverage = "complete" | "partial";

export type CityMobilityProperties = {
  id: string;
  name: string;
  mobility_kind: "sidewalk" | "ramp" | "path";
  status: "EXISTING" | "PLANNED" | "PROPOSED" | "DEV" | "UNKNOWN";
  /** Only a confirmed existing line can contribute routing geometry. */
  routing_eligible: boolean;
  routing_role: "network" | "context";
  street_name?: string;
  surface_type?: string;
  width_ft?: number;
  ramp_type?: string;
  ramp_material?: string;
  tactile_warning_pad?: string;
  ada_description?: string;
  data_date?: string;
  length_ft?: number;
  source_id: "cof_sidewalks" | "cof_path_plan";
};

export type CityMobilitySourceSummary = {
  label: string;
  status: CityMobilitySourceStatus;
  count: number;
  checkedAt?: string;
  coverage: CityMobilityCoverage;
  reason?: string;
  sourceUrl: string;
};

export type CityMobilityCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  CityMobilityProperties
> & {
  radius: {
    status: CityMobilitySourceStatus;
    coverage: CityMobilityCoverage;
    checkedAt?: string;
    queryBounds: CityMobilityBounds;
    queryDetail: "network" | "street";
    geography: "City of Frederick";
    routingRule: "Only confirmed EXISTING linework may inform a route.";
    sources: {
      sidewalks: CityMobilitySourceSummary;
      ramps: CityMobilitySourceSummary;
      paths: CityMobilitySourceSummary;
      bikePaths: CityMobilitySourceSummary;
    };
  };
};

export type CityMobilityBoundsResult =
  | { ok: true; bounds: CityMobilityBounds }
  | {
      ok: false;
      reason:
        | "missing-area"
        | "invalid-area"
        | "area-too-large";
    };

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function validateCityMobilityBounds(
  bounds: CityMobilityBounds,
): CityMobilityBoundsResult {
  const { west, south, east, north } = bounds;
  if (
    ![west, south, east, north].every(finite) ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    return { ok: false, reason: "invalid-area" };
  }
  const width = east - west;
  const height = north - south;
  if (
    width > CITY_MOBILITY_MAX_WIDTH_DEGREES ||
    height > CITY_MOBILITY_MAX_HEIGHT_DEGREES ||
    width * height > CITY_MOBILITY_MAX_AREA_DEGREES
  ) {
    return { ok: false, reason: "area-too-large" };
  }
  return { ok: true, bounds };
}

export function parseCityMobilityBounds(
  searchParams: URLSearchParams,
): CityMobilityBoundsResult {
  const rawBbox = searchParams.get("bbox");
  if (rawBbox) {
    const parts = rawBbox.split(",").map(Number);
    if (parts.length !== 4) return { ok: false, reason: "invalid-area" };
    return validateCityMobilityBounds({
      west: parts[0],
      south: parts[1],
      east: parts[2],
      north: parts[3],
    });
  }

  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const radiusRaw = searchParams.get("radiusM");
  if (latRaw === null && lngRaw === null && radiusRaw === null) {
    return { ok: false, reason: "missing-area" };
  }
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  const radiusM = Number(radiusRaw);
  if (
    !finite(lat) ||
    !finite(lng) ||
    !finite(radiusM) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    radiusM < 100 ||
    radiusM > CITY_MOBILITY_MAX_RADIUS_METERS
  ) {
    return { ok: false, reason: "invalid-area" };
  }

  const latDelta = radiusM / 111_320;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lngDelta = radiusM / (111_320 * cosLat);
  return validateCityMobilityBounds({
    west: lng - lngDelta,
    south: lat - latDelta,
    east: lng + lngDelta,
    north: lat + latDelta,
  });
}

export function cityMobilityBoundsIntersect(
  a: CityMobilityBounds,
  b: CityMobilityBounds,
): boolean {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  );
}

export function cityMobilityViewportQuery(
  bounds: CityMobilityBounds,
  zoom: number,
): string | null {
  if (zoom < CITY_MOBILITY_MIN_ZOOM) return null;
  if (!cityMobilityBoundsIntersect(bounds, CITY_MOBILITY_EXTENT)) return null;
  const valid = validateCityMobilityBounds(bounds);
  if (!valid.ok) return null;
  return [bounds.west, bounds.south, bounds.east, bounds.north]
    .map((value) => value.toFixed(5))
    .join(",");
}

export function cityMobilityStatusLabel(
  status: CityMobilitySourceStatus,
  coverage: CityMobilityCoverage,
): string {
  if (status === "unavailable") return "City walking records are unavailable.";
  if (status === "stale") return "Showing an earlier City walking snapshot.";
  if (coverage === "partial") return "Some City walking records are available.";
  return "City walking records are current.";
}
