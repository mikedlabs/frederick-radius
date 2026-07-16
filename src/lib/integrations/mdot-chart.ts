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
export function cleanChartDescription(text: string): string {
  const clean = text
    .replace(/^(action event|incident|event|road ?work)\s*@\s*/i, "")
    .replace(/\bVOL\s*:\s*Compacted Demand\b/gi, "Heavy traffic")
    .replace(/\s+/g, " ")
    .trim();
  return clean || text.trim();
}

/** Translate CHART machine labels before they reach a human-facing detail row. */
export function cleanChartLaneStatus(value: unknown): string | undefined {
  if (value == null) return undefined;
  const clean = String(value)
    .trim()
    .replace(/^VOL\s*:\s*Compacted Demand$/i, "Heavy traffic")
    .replace(/^VOL\s*:\s*/i, "Traffic volume: ");
  if (!clean || /^(none|n\/?a|unknown|null|undefined)$/i.test(clean)) return undefined;
  return clean;
}

/** CHART sends the literal string "None" (and "N/A", "Unknown") for an unset
 *  direction, which the old truthy check let through and surfaces rendered as
 *  "US 15 None" (audit FR-002). Normalize those placeholders to undefined. */
function cleanDirection(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s || /^(none|n\/?a|unknown|null|undefined)$/i.test(s)) return undefined;
  return s;
}

const SEVERITY_RANK: Record<ChartIncident["severity"], number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

/** CHART occasionally republishes one active road event under a new row id.
 * Collapse those copies using normalized content + ~100m coordinates, keeping
 * the more severe/newer record. */
export function dedupeChartIncidents(incidents: ChartIncident[]): ChartIncident[] {
  const byKey = new Map<string, ChartIncident>();
  for (const incident of incidents) {
    const key = [
      incident.type,
      incident.road.toLocaleLowerCase(),
      (incident.direction ?? "").toLocaleLowerCase(),
      incident.description.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
      incident.lat.toFixed(3),
      incident.lng.toFixed(3),
    ].join("|");
    const previous = byKey.get(key);
    if (
      !previous ||
      SEVERITY_RANK[incident.severity] > SEVERITY_RANK[previous.severity] ||
      (incident.severity === previous.severity && Date.parse(incident.started_at) > Date.parse(previous.started_at))
    ) {
      byKey.set(key, incident);
    }
  }
  return [...byKey.values()];
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
      const clean = cleanChartDescription(name) || cleanChartDescription(action) || "Active traffic event";
      const startMs = num(raw.startDateTime);
      incidents.push({
        id: String(raw.id ?? `${clean}-${lat}-${lng}`),
        type: eventType(raw, text),
        description: clean,
        county,
        road: extractRoad(name),
        direction: cleanDirection(raw.direction),
        location: clean,
        lat,
        lng,
        started_at: startMs ? new Date(startMs).toISOString() : new Date().toISOString(),
        severity: severity(raw, text),
        lanes_affected: cleanChartLaneStatus(raw.lanesStatus),
      });
    }
    return dedupeChartIncidents(incidents)
      .sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at));
  } catch {
    return [];
  }
}
