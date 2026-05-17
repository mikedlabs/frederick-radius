/**
 * City of Frederick Tax Parcels to a normalized GeoJSON
 * FeatureCollection.
 *
 * Why geometry passes through: the source is queried with outSR=4326,
 * so coordinates are already WGS84, and parcels are polygons the app
 * wants to draw as is. The transform only normalizes the attribute
 * bag: snake_case keys, a single address shape, dropped ArcGIS noise
 * (OBJECTID, Shape.STArea, annotation fields). It is pure and
 * deterministic. The assessment owner name is intentionally not
 * exposed by the source, which is good for privacy and we keep it that
 * way.
 */

import {
  toNumber,
  address,
  type GeoJson,
  type GeoFeature,
  type TransformResult,
} from "../pipeline/lib/normalize";
import type { CofParcelsRaw } from "../pipeline/schemas_ts/cof_parcels";

export function transform(raw: CofParcelsRaw): TransformResult {
  const features: GeoFeature[] = raw.features
    .filter((f) => f.geometry != null)
    .map((f) => {
      const p = f.properties;
      const overlays = [p.OVERLAY_1, p.OVERLAY_2]
        .map((o) => (o ?? "").trim())
        .filter((o) => o.length > 0);
      return {
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          parcel_id: (p.TAX_ACCT ?? p.ACCT ?? p.PIN ?? "").trim(),
          pin: (p.PIN ?? "").trim() || undefined,
          address: address({
            street: p.ADDRESS ?? "",
            city: "Frederick",
            state: "MD",
            zip: "",
          }),
          zoning: (p.ZONING ?? "").trim() || undefined,
          zoning_overlays: overlays,
          land_use: (p.LandUse ?? "").trim() || undefined,
          acreage: toNumber(p.CALC_ACRE) ?? undefined,
          subdivision: (p.Sub ?? "").trim() || undefined,
          neighborhood_advisory_council: (p.NAC ?? "").trim() || undefined,
          election_district: toNumber(p.ElectionDistrict) ?? undefined,
          schools: {
            elementary: (p.ELEM_DIST ?? "").trim() || undefined,
            middle: (p.MID_DIST ?? "").trim() || undefined,
            high: (p.HIGH_DIST ?? "").trim() || undefined,
          },
          source: "cof_parcels",
        },
      };
    });

  const data: GeoJson = { type: "FeatureCollection", features };
  return { format: "geojson", data };
}
