/**
 * City of Frederick parcel context resolver.
 *
 * This reads the pipeline output data/clean/cof_parcels.geojson (the
 * normalized Tax Parcel layer) and, for a given point, returns the
 * containing parcel's civic context: address, zoning, land use, NAC,
 * election district, and school districts.
 *
 * It is gated and dormant by default. Until the City source is approved
 * and activated (see data/sources.yaml) the clean file does not exist
 * and COF_PARCELS is not set, so loadParcels returns null and every
 * caller degrades to showing nothing. Nothing about production changes
 * until the gate is flipped.
 *
 * parcelContextFor is pure and deterministic so it can be unit tested
 * with a fixture, with no live City data and no network.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type ParcelAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type ParcelContext = {
  parcel_id: string;
  address: ParcelAddress;
  zoning?: string;
  zoning_overlays: string[];
  land_use?: string;
  acreage?: number;
  subdivision?: string;
  neighborhood_advisory_council?: string;
  election_district?: number;
  schools: { elementary?: string; middle?: string; high?: string };
};

type Ring = [number, number][];
type ParcelFeature = {
  type: "Feature";
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] }
    | null;
  properties: Record<string, unknown>;
};
export type ParcelFeatureCollection = {
  type: "FeatureCollection";
  features: ParcelFeature[];
};

/** Ray casting point in ring test. lng,lat are planar enough at city scale. */
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** A point is in a polygon when it is in the outer ring and no hole. */
function pointInPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  if (rings.length === 0 || !pointInRing(lng, lat, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lng, lat, rings[h])) return false; // inside a hole
  }
  return true;
}

function geometryContains(
  geom: ParcelFeature["geometry"],
  lng: number,
  lat: number,
): boolean {
  if (!geom) return false;
  if (geom.type === "Polygon") return pointInPolygon(lng, lat, geom.coordinates);
  return geom.coordinates.some((poly) => pointInPolygon(lng, lat, poly));
}

/**
 * The containing parcel's context for a point, or null when no parcel
 * contains it. Pure: the FeatureCollection is passed in.
 */
export function parcelContextFor(
  fc: ParcelFeatureCollection,
  lng: number,
  lat: number,
): ParcelContext | null {
  for (const f of fc.features) {
    if (geometryContains(f.geometry, lng, lat)) {
      return f.properties as unknown as ParcelContext;
    }
  }
  return null;
}

// Module level cache: the clean file is large, parse it once per server
// process. Reset implicitly on redeploy.
let cache: ParcelFeatureCollection | null | undefined;

/**
 * Load the pipeline output, or null when the source is not yet
 * activated. Gated by COF_PARCELS so an unconfirmed license can never
 * surface City data by accident.
 */
export function loadParcels(): ParcelFeatureCollection | null {
  if (process.env.COF_PARCELS !== "1") return null;
  if (cache !== undefined) return cache;
  const file = join(process.cwd(), "data", "clean", "cof_parcels.geojson");
  if (!existsSync(file)) {
    cache = null;
    return null;
  }
  try {
    cache = JSON.parse(readFileSync(file, "utf8")) as ParcelFeatureCollection;
  } catch {
    cache = null;
  }
  return cache;
}
