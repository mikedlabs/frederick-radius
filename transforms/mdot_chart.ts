/**
 * CHART statewide incidents to a normalized GeoJSON FeatureCollection
 * of Frederick County incidents.
 *
 * Why filter here: CHART returns the whole state. The app only shows
 * Frederick County, so the transform keeps rows whose county text
 * mentions Frederick and that carry usable coordinates.
 */

import {
  toNumber,
  isoDate,
  pointFeature,
  featureCollection,
  type TransformResult,
} from "../pipeline/lib/normalize";
import type { MdotChartRaw } from "../pipeline/schemas_ts/mdot_chart";

function severity(s: string | undefined): "low" | "medium" | "high" {
  const l = (s ?? "").toLowerCase();
  if (l.includes("severe") || l.includes("major") || l.includes("high")) return "high";
  if (l.includes("moderate") || l.includes("medium")) return "medium";
  return "low";
}

function eventType(s: string | undefined): string {
  const t = (s ?? "").toLowerCase();
  if (t.includes("construction") || t.includes("roadwork")) return "construction";
  if (t.includes("disabled")) return "disabled";
  if (t.includes("weather")) return "weather";
  if (t.includes("special") || t.includes("event")) return "special";
  if (t.includes("incident") || t.includes("accident") || t.includes("crash")) return "incident";
  return "other";
}

export function transform(raw: MdotChartRaw): TransformResult {
  const features = [];
  for (const r of raw) {
    const county = String(r.County ?? "").trim();
    if (!/frederick/i.test(county)) continue;
    const lat = toNumber(r.Lat);
    const lng = toNumber(r.Lng ?? r.Long);
    if (lat === null || lng === null) continue;

    features.push(
      pointFeature(
        { lat, lng },
        {
          external_id: String(r.Id ?? `${r.Road ?? ""}-${r.Started ?? ""}-${lat}-${lng}`),
          incident_type: eventType(r.EventType),
          description: String(r.Description ?? "Active traffic incident").trim(),
          county,
          road: String(r.Road ?? "").trim(),
          direction: r.Direction ? String(r.Direction).trim() : undefined,
          location: String(r.Location ?? r.Road ?? "").trim(),
          severity: severity(r.Severity),
          lanes_affected: r.LanesAffected ? String(r.LanesAffected) : undefined,
          started_at: isoDate(r.Started),
          expected_end: isoDate(r.EstimatedClearance),
          source: "mdot_chart",
        },
      ),
    );
  }
  return { format: "geojson", data: featureCollection(features) };
}
