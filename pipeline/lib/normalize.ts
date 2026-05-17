/**
 * Shared, pure normalization helpers used by every transform.
 *
 * These live in one place so the non negotiable rules (WGS84
 * coordinates, ISO 8601 dates, a single address shape, snake_case
 * output) are defined once and cannot drift per source. Nothing here
 * does network, model, or random work, so transforms stay deterministic
 * and unit testable.
 */

export type Wgs84 = { lat: number; lng: number };

export type NormalizedAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

/** A GeoJSON point Feature with snake_case string keyed properties. */
export type PointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
};

export type FeatureCollection = {
  type: "FeatureCollection";
  features: PointFeature[];
};

/** Parse to a finite number or null. Null is honest about missing data. */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Parse any reasonable date input to an ISO 8601 string. Returns null
 * rather than guessing when the input is missing or unparseable, so a
 * bad upstream date never becomes a fabricated timestamp.
 */
export function isoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Frederick County bounding box. The app already uses this range to
 * reject coordinates that are clearly outside the county, so the
 * pipeline reuses the same bounds for consistency.
 */
export function inFrederickBbox(lat: number, lng: number): boolean {
  return lat >= 39.0 && lat <= 40.0 && lng >= -78.0 && lng <= -76.7;
}

/** Build a normalized address. Missing parts become empty strings. */
export function address(parts: Partial<NormalizedAddress>): NormalizedAddress {
  return {
    street: (parts.street ?? "").trim(),
    city: (parts.city ?? "").trim(),
    state: (parts.state ?? "").trim(),
    zip: (parts.zip ?? "").trim(),
  };
}

export function pointFeature(
  geom: Wgs84,
  properties: Record<string, unknown>,
): PointFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [geom.lng, geom.lat] },
    properties,
  };
}

export function featureCollection(features: PointFeature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

/** What every transform returns. The worker picks the file extension. */
export type TransformResult =
  | { format: "geojson"; data: FeatureCollection }
  | { format: "json"; data: unknown };
