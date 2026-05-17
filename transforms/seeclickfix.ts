/**
 * SeeClickFix issues to a normalized GeoJSON FeatureCollection.
 *
 * The query already restricts to the county bounding box, so the
 * transform only normalizes shape: stable status values, an ISO
 * timestamp, and a trimmed description.
 */

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
    if (!Number.isFinite(i.lat) || !Number.isFinite(i.lng)) continue;
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
