/**
 * Maryland CHART (Coordinated Highways Action Response Team) — live traffic data.
 * Free, no key required. JSON endpoint refreshes ~every 90 seconds.
 *
 * Endpoint: https://chart.maryland.gov/Incidents/GetIncidents
 * Filtered to Frederick County (us-1, us-15, us-40, us-340, i-70, i-270).
 */

const ENDPOINT = "https://chart.maryland.gov/Incidents/GetIncidents";

export type ChartIncident = {
  id: string;
  type: "Incident" | "Construction" | "Disabled" | "Weather" | "Special" | "Other";
  description: string;
  county: string;
  road: string;
  direction?: string;
  location: string;
  lng: number;
  lat: number;
  started_at: string;
  expected_end?: string;
  severity: "Low" | "Medium" | "High";
  lanes_affected?: string;
};

// CHART returns geo coordinates as lat/lng pairs in their feed structure.
// Schema observed in the live API as of 2026. We're defensive — extract what we can.
type RawIncident = {
  Id?: string | number;
  EventType?: string;
  Description?: string;
  County?: string;
  Road?: string;
  Direction?: string;
  Location?: string;
  Lat?: string | number;
  Lng?: string | number;
  Long?: string | number;
  Started?: string;
  EstimatedClearance?: string;
  Severity?: string;
  LanesAffected?: string;
};

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function severity(s: string | undefined): ChartIncident["severity"] {
  const lower = (s ?? "").toLowerCase();
  if (lower.includes("severe") || lower.includes("major") || lower.includes("high")) return "High";
  if (lower.includes("moderate") || lower.includes("medium")) return "Medium";
  return "Low";
}

function eventType(s: string | undefined): ChartIncident["type"] {
  const t = (s ?? "").toLowerCase();
  if (t.includes("construction") || t.includes("roadwork")) return "Construction";
  if (t.includes("disabled")) return "Disabled";
  if (t.includes("weather")) return "Weather";
  if (t.includes("special") || t.includes("event")) return "Special";
  if (t.includes("incident") || t.includes("accident") || t.includes("crash")) return "Incident";
  return "Other";
}

export async function getChartIncidentsFrederick(): Promise<ChartIncident[]> {
  try {
    const res = await fetch(ENDPOINT, {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data)) return [];

    const incidents: ChartIncident[] = [];
    for (const raw of data as RawIncident[]) {
      const county = String(raw.County ?? "").trim();
      if (!/frederick/i.test(county)) continue;
      const lat = num(raw.Lat);
      const lng = num(raw.Lng ?? raw.Long);
      if (lat === null || lng === null) continue;
      incidents.push({
        id: String(raw.Id ?? `${raw.Road}-${raw.Started}-${lat}-${lng}`),
        type: eventType(raw.EventType),
        description: String(raw.Description ?? "Active traffic incident").trim(),
        county,
        road: String(raw.Road ?? "").trim(),
        direction: raw.Direction ? String(raw.Direction).trim() : undefined,
        location: String(raw.Location ?? raw.Road ?? "").trim(),
        lat, lng,
        started_at: raw.Started ? new Date(raw.Started).toISOString() : new Date().toISOString(),
        expected_end: raw.EstimatedClearance ? new Date(raw.EstimatedClearance).toISOString() : undefined,
        severity: severity(raw.Severity),
        lanes_affected: raw.LanesAffected ? String(raw.LanesAffected) : undefined,
      });
    }
    incidents.sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at));
    return incidents;
  } catch {
    return [];
  }
}
