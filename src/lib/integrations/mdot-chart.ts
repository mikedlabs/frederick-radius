/**
 * Maryland CHART (Coordinated Highways Action Response Team) — live traffic
 * events. Free, no key required. Refreshes continuously.
 *
 * Endpoint: the CHART Export map-data feed. The old
 * chart.maryland.gov/Incidents/GetIncidents endpoint started returning an HTML
 * page (not JSON) in 2026 — the parse silently fail-softed to [], so the
 * /pulse + /map traffic tiles showed nothing. Repointed 2026-07-12 to the
 * live CHARTExportClientService JSON feed (fetch-verified: county-tagged,
 * lat/lon per event). Output shape (ChartIncident) is unchanged so every
 * consumer keeps working.
 */

const ENDPOINT =
  "https://chartexp1.sha.maryland.gov/CHARTExportClientService/getEventMapDataJSON.do";

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

/** One event in the CHARTExportClientService map-data payload. Defensive —
 *  only the fields we read are typed. */
type RawEvent = {
  id?: string;
  county?: string;
  name?: string;
  description?: string;
  direction?: string;
  incidentType?: string;
  lat?: number | string;
  lon?: number | string;
  lanes?: unknown[];
  lanesStatus?: string;
  startDateTime?: number | string;
  closed?: boolean;
  trafficAlert?: boolean;
  additionalData?: { actionTypes?: { actionType?: string }[] };
};

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Signal-bulb-outs, camera outages, and test rows are SHA maintenance logs,
 *  not driver-relevant traffic. Drop them so the tile shows real incidents. */
function isMaintenanceNoise(text: string): boolean {
  return /\bbulb out\b|\bcamera\b|\btest event\b|sign (out|malfunction)/i.test(text);
}

function severity(e: RawEvent, text: string): ChartIncident["severity"] {
  if (e.trafficAlert === true) return "High";
  if (/crash|collision|overturned|closed|blocked|all lanes|fatal/i.test(text)) return "High";
  if (/construction|roadwork|work zone|disabled|shoulder|right lane|left lane/i.test(text)) return "Medium";
  return "Low";
}

function eventType(e: RawEvent, text: string): ChartIncident["type"] {
  const t = `${e.incidentType ?? ""} ${text}`.toLowerCase();
  if (t.includes("construction") || t.includes("roadwork") || t.includes("work zone")) return "Construction";
  if (t.includes("disabled")) return "Disabled";
  if (t.includes("weather") || t.includes("flooding") || t.includes("snow") || t.includes("ice")) return "Weather";
  if (t.includes("special") || t.includes("event")) return "Special";
  if (t.includes("incident") || t.includes("accident") || t.includes("crash") || t.includes("collision")) return "Incident";
  return "Other";
}

/** Pull a route token (I-70, US 15, MD 26) out of the CHART description. */
function extractRoad(text: string): string {
  const m = text.match(/\b(I-?\d+|US ?\d+|MD ?\d+)\b/i);
  return m ? m[1].toUpperCase().replace(/^I(\d)/, "I-$1").replace(/^(US|MD)(\d)/, "$1 $2") : "";
}

/** Strip CHART's "Action Event @ " / "Incident @ " logging prefix. */
function cleanDescription(text: string): string {
  return text.replace(/^(action event|incident|event|road ?work)\s*@\s*/i, "").trim() || text;
}

export async function getChartIncidentsFrederick(): Promise<ChartIncident[]> {
  try {
    const res = await fetch(ENDPOINT, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FrederickRadius/1.0; +https://frederickradius.app)",
        Accept: "application/json",
      },
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    if (!data) return [];
    // The CHARTExport feed wraps events under `data`: { data: [...],
    // success, totalCount }. Accept that, an `events` key, or a bare array.
    const asObj = data as { data?: RawEvent[]; events?: RawEvent[] };
    const events: RawEvent[] = Array.isArray(data)
      ? (data as RawEvent[])
      : Array.isArray(asObj.data)
        ? asObj.data
        : Array.isArray(asObj.events)
          ? asObj.events
          : [];

    const incidents: ChartIncident[] = [];
    for (const raw of events) {
      const county = String(raw.county ?? "").trim();
      if (!/frederick/i.test(county)) continue;
      if (raw.closed === true) continue; // only active events
      const lat = num(raw.lat);
      const lng = num(raw.lon);
      if (lat === null || lng === null) continue;
      const name = String(raw.name ?? raw.description ?? "").trim();
      const action = raw.additionalData?.actionTypes?.[0]?.actionType ?? "";
      const text = `${name} ${action} ${raw.incidentType ?? ""}`;
      if (isMaintenanceNoise(text)) continue;
      const clean = cleanDescription(name) || action || "Active traffic event";
      const startMs = num(raw.startDateTime);
      incidents.push({
        id: String(raw.id ?? `${clean}-${lat}-${lng}`),
        type: eventType(raw, text),
        description: clean,
        county,
        road: extractRoad(name),
        direction: raw.direction ? String(raw.direction).trim() : undefined,
        location: clean,
        lat,
        lng,
        started_at: startMs ? new Date(startMs).toISOString() : new Date().toISOString(),
        severity: severity(raw, text),
        lanes_affected: raw.lanesStatus ? String(raw.lanesStatus).trim() || undefined : undefined,
      });
    }
    incidents.sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at));
    return incidents;
  } catch {
    return [];
  }
}
