/**
 * SeeClickFix issues to a normalized GeoJSON FeatureCollection.
 *
 * The request is scoped to place_url=frederick-county (a bbox-only
 * query is silently ignored by the v2 API and returns the global
 * feed). As defense in depth this transform also drops any issue
 * outside the county bounding box before normalizing shape.
 */

// Frederick County bbox: south, west, north, east.
const BBOX_S = 39.265;
const BBOX_W = -77.7;
const BBOX_N = 39.745;
const BBOX_E = -77.15;
function inFrederickBbox(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= BBOX_S &&
    lat <= BBOX_N &&
    lng >= BBOX_W &&
    lng <= BBOX_E
  );
}

import {
  isoDate,
  pointFeature,
  featureCollection,
  type TransformResult,
} from "../pipeline/lib/normalize";
import type { SeeClickFixRaw } from "../pipeline/schemas_ts/seeclickfix";

function normStatus(s: string): "open" | "acknowledged" | "closed" {
  const l = s.toLowerCase();
  if (l.includes("close")) return "closed";
  if (l.includes("ack") || l.includes("progress")) return "acknowledged";
  return "open";
}

export function transform(raw: SeeClickFixRaw): TransformResult {
  const features = [];
  for (const i of raw.issues) {
    if (!inFrederickBbox(i.lat, i.lng)) continue;
    features.push(
      pointFeature(
        { lat: i.lat, lng: i.lng },
        {
          external_id: String(i.id),
          summary: (i.summary ?? "").trim(),
          description: (i.description ?? "").slice(0, 200).trim(),
          address: (i.address ?? "").trim(),
          status: normStatus(i.status),
          status_raw: i.status,
          category: i.request_type?.title ?? "Issue",
          reported_at: isoDate(i.created_at),
          url: i.html_url ?? i.url ?? "",
          source: "seeclickfix",
        },
      ),
    );
  }
  return { format: "geojson", data: featureCollection(features) };
}
