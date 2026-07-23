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

function severity(
  trafficAlert: boolean | undefined,
  text: string,
): "low" | "medium" | "high" {
  if (trafficAlert || /crash|collision|overturned|closed|blocked|all lanes|fatal/i.test(text)) {
    return "high";
  }
  if (/construction|roadwork|work zone|disabled|shoulder|lane/i.test(text)) {
    return "medium";
  }
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

function extractRoad(text: string): string {
  const match = text.match(/\b(I-?\d+|US ?\d+|MD ?\d+)\b/i);
  return match
    ? match[1]
        .toUpperCase()
        .replace(/^I(\d)/, "I-$1")
        .replace(/^(US|MD)(\d)/, "$1 $2")
    : "";
}

function isMaintenanceNoise(text: string): boolean {
  return /\bbulb out\b|\bcamera\b|\btest event\b|sign (out|malfunction)/i.test(text);
}

function cleanDescription(text: string): string {
  return text
    .replace(/^(action event|incident|event|road ?work)\s*@\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function transform(raw: MdotChartRaw): TransformResult {
  const features = [];
  for (const r of raw.data) {
    const county = String(r.county ?? "").trim();
    if (!/frederick/i.test(county)) continue;
    if (r.closed === true) continue;
    const lat = toNumber(r.lat);
    const lng = toNumber(r.lon);
    if (lat === null || lng === null) continue;
    const name = String(r.name ?? r.description ?? "").trim();
    const action = r.additionalData?.actionTypes?.[0]?.actionType ?? "";
    const text = `${name} ${action} ${r.incidentType ?? ""}`;
    if (isMaintenanceNoise(text)) continue;
    const description = cleanDescription(name || action) || "Active traffic event";

    features.push(
      pointFeature(
        { lat, lng },
        {
          external_id: String(r.id ?? `${description}-${r.startDateTime ?? ""}-${lat}-${lng}`),
          incident_type: eventType(`${r.incidentType ?? ""} ${text}`),
          description,
          county,
          road: extractRoad(name),
          direction: r.direction ? String(r.direction).trim() : undefined,
          location: description,
          severity: severity(r.trafficAlert, text),
          lanes_affected: r.lanesStatus?.trim() || undefined,
          started_at: isoDate(r.startDateTime),
          expected_end: null,
          source: "mdot_chart",
        },
      ),
    );
  }
  return { format: "geojson", data: featureCollection(features) };
}
