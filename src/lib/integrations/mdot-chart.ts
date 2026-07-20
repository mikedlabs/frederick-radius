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

// ---------------------------------------------------------------------------
// Human-facing formatting. Boundary cleaning per CLAUDE.md: a CHART machine
// string ("RAMP 8 FR US 15 SB TO US 40 WB [Traffic Control Signal]") must
// never reach a hero or an alert card raw. These pure helpers decode the
// codes into plain language once, so every surface renders the same clean
// text. Kept unit-testable (time-based helpers take an explicit `now`).
// ---------------------------------------------------------------------------

/** Cardinal direction word from a CHART direction code ("SB" -> "South",
 *  "(WB/L)" -> "West"). Empty string when unknown, so callers can drop it. */
export function chartDirectionWord(dir?: string): string {
  if (!dir) return "";
  const key = dir.toLowerCase().replace(/[()]/g, "").replace(/\/[lrc]$/, "").trim();
  const map: Record<string, string> = {
    nb: "North", sb: "South", eb: "East", wb: "West",
    n: "North", s: "South", e: "East", w: "West",
    north: "North", south: "South", east: "East", west: "West",
    northbound: "North", southbound: "South", eastbound: "East", westbound: "West",
    "inner loop": "Inner Loop", "outer loop": "Outer Loop",
  };
  return map[key] ?? "";
}

/** "US 15 North" from a route + direction; bare route when direction unknown. */
export function chartRoad(incident: Pick<ChartIncident, "road" | "direction">): string {
  const road = incident.road?.trim();
  if (!road) return "";
  const dir = chartDirectionWord(incident.direction);
  return dir ? `${road} ${dir}` : road;
}

// Local street name for a state route number, so a reader who knows "Patrick
// Street" but not "US 40" still gets it. Small and hand-verified — a wrong
// alias is worse than none, so only include unambiguous county-wide names.
const ROAD_ALIASES: Record<string, string> = {
  "US 40": "W Patrick St",
  "MD 26": "Liberty Rd",
  "MD 355": "Urbana Pike",
  "MD 85": "Buckeystown Pike",
  "MD 144": "Old National Pike",
};

/** Local street name for a route number ("US 40" -> "W Patrick St"), if known. */
export function roadAlias(road: string): string | undefined {
  if (!road) return undefined;
  return ROAD_ALIASES[road.toUpperCase().replace(/\s+/g, " ").trim()];
}

const BOUND: Record<string, string> = {
  nb: "northbound", sb: "southbound", eb: "eastbound", wb: "westbound",
};
const LANE: Record<string, string> = { l: "left lane", r: "right lane", c: "center lane" };

/** Expand a ramp endpoint ("US 15 SB" -> "US 15 South"). */
function humanizeSegment(seg: string): string {
  return seg
    .trim()
    .replace(/\b([NSEW]B)\b/gi, (m) => chartDirectionWord(m) || m)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Decode a raw CHART description into plain language: ramp grammar, direction
 * and lane codes, and bracketed device tags. Safe on already-clean text.
 */
export function humanizeChartText(text: string): string {
  if (!text) return "";
  let t = text;
  // "RAMP 8 FR US 15 SB TO US 40 WB" -> "the ramp from US 15 South to US 40 West"
  t = t.replace(
    /\bRAMP\s*\d*\s*FR\s+(.+?)\s+TO\s+(.+?)(?=[.,;]|$)/gi,
    (_m, from: string, to: string) => `the ramp from ${humanizeSegment(from)} to ${humanizeSegment(to)}`,
  );
  // "(WB/L)" -> "westbound, left lane"; "(NB)" -> "northbound"
  t = t.replace(/\(([NSEW]B)(?:\/([LRC]))?\)/gi, (_m, d: string, lane?: string) => {
    const bound = BOUND[d.toLowerCase()] ?? "";
    const laneWord = lane ? LANE[lane.toLowerCase()] : "";
    return [bound, laneWord].filter(Boolean).join(", ");
  });
  // Strip bracketed device tags: "[Traffic Control Signal]".
  t = t.replace(/\[[^\]]*\]/g, "");
  return t.replace(/\s+/g, " ").trim();
}

/** A plain sentence describing what kind of event this is, chosen from the
 *  type plus description keywords (so a "Special" row never renders "Special."). */
export function chartTypeSentence(incident: Pick<ChartIncident, "type" | "description">): string {
  const text = `${incident.description} ${incident.type}`.toLowerCase();
  if (/signal|traffic control/.test(text)) return "A traffic signal issue is reported.";
  if (/crash|collision|overturn|accident|fatal/.test(text)) return "A crash is blocking lanes.";
  if (/disabled|stalled|breakdown/.test(text)) return "A disabled vehicle is on the road.";
  if (/flood|snow|ice|weather/.test(text)) return "Weather is affecting the road.";
  if (/construction|roadwork|work zone|road work/.test(text)) return "Road work is under way.";
  switch (incident.type) {
    case "Construction": return "Road work is under way.";
    case "Disabled": return "A disabled vehicle is on the road.";
    case "Weather": return "Weather is affecting the road.";
    case "Special": return "A special event is affecting traffic.";
    case "Incident": return "An incident is affecting traffic.";
    default: return "A traffic event is reported.";
  }
}

/** Subject-led hero sentence: "US 40 West (W Patrick St) has a reported incident." */
export function chartHeroSentence(incident: Pick<ChartIncident, "road" | "direction" | "type" | "description">): string {
  const road = chartRoad(incident);
  const alias = incident.road ? roadAlias(incident.road) : undefined;
  const subject = road ? (alias ? `${road} (${alias})` : road) : "A Frederick County road";
  const text = `${incident.description} ${incident.type}`.toLowerCase();
  let predicate: string;
  if (/signal|traffic control/.test(text)) predicate = "has a reported signal issue.";
  else if (/crash|collision|overturn|accident|fatal/.test(text)) predicate = "has a reported crash.";
  else if (/disabled|stalled|breakdown/.test(text)) predicate = "has a disabled vehicle.";
  else if (/flood|snow|ice|weather/.test(text)) predicate = "is affected by weather.";
  else if (/construction|roadwork|work zone|road work/.test(text) || incident.type === "Construction")
    predicate = "has road work under way.";
  else if (incident.type === "Incident") predicate = "has a reported incident.";
  else predicate = "has an active traffic event.";
  return `${subject} ${predicate}`;
}

/** Short title for a compact alert row: "Crash on US 15 North". */
export function chartTodayTitle(incident: Pick<ChartIncident, "road" | "direction" | "type" | "description">): string {
  const road = chartRoad(incident);
  const text = `${incident.description} ${incident.type}`.toLowerCase();
  let noun: string;
  if (/crash|collision|overturn|accident|fatal/.test(text)) noun = "Crash";
  else if (/signal|traffic control/.test(text)) noun = "Signal issue";
  else if (/disabled|stalled|breakdown/.test(text)) noun = "Disabled vehicle";
  else if (/flood|snow|ice|weather/.test(text) || incident.type === "Weather") noun = "Weather closure";
  else if (incident.type === "Construction") noun = "Road work";
  else noun = "Traffic incident";
  return road ? `${noun} on ${road}` : noun;
}

function fmtEastern(t: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(t);
}

/** Freshness tail with the one fact a reader wants: when it clears, else how
 *  long it has been running. "Clears ~5:00 PM" / "Started 25m ago". */
export function chartFreshnessTail(
  incident: Pick<ChartIncident, "started_at" | "expected_end">,
  now: Date,
): string {
  if (incident.expected_end) {
    const end = new Date(incident.expected_end);
    if (!Number.isNaN(end.getTime()) && end > now) return `Clears ~${fmtEastern(end)}`;
  }
  const start = new Date(incident.started_at);
  if (!Number.isNaN(start.getTime())) {
    const mins = Math.round((now.getTime() - start.getTime()) / 60000);
    if (mins < 1) return "Just reported";
    if (mins < 60) return `Started ${mins}m ago`;
    return `Started ${Math.round(mins / 60)}h ago`;
  }
  return "Active now";
}

// The only routes plan-changing enough to interrupt /today. An incident on a
// side street stays pulse-only; these are the arteries a trip actually uses.
const TODAY_ROADS = new Set([
  "I-70", "I-270", "US 15", "US 40", "US 340", "MD 26", "MD 85", "MD 144", "MD 355",
]);

/**
 * Strict allowlist for surfacing a traffic incident on /today's Heads up slot.
 * ALL must hold: High severity, an Incident/Weather type (not planned work or a
 * signal glitch), a major route, started within 12h, and not already cleared.
 * A typical day qualifies nothing; only an I-70-closed / fatal-crash class
 * event interrupts. Exported + unit-tested so the threshold stays honest.
 */
export function qualifiesForToday(incident: ChartIncident, now: Date = new Date()): boolean {
  if (incident.severity !== "High") return false;
  if (incident.type !== "Incident" && incident.type !== "Weather") return false;
  const road = incident.road?.toUpperCase().replace(/\s+/g, " ").trim();
  if (!road || !TODAY_ROADS.has(road)) return false;
  const start = Date.parse(incident.started_at);
  if (!Number.isFinite(start)) return false;
  const age = now.getTime() - start;
  if (age < 0 || age > 12 * 60 * 60 * 1000) return false;
  if (incident.expected_end) {
    const end = Date.parse(incident.expected_end);
    if (Number.isFinite(end) && end < now.getTime()) return false;
  }
  return true;
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
