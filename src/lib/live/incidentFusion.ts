import type {
  GeocodedIncident,
} from "@/lib/integrations/scannerIncidents";
import type {
  ChartIncident,
} from "@/lib/integrations/mdot-chart";
import {
  sanitizeLocation,
  type PublicIncidentKind,
} from "@/lib/scanner/incidentFeed";

/**
 * Pure Frederick Scanner -> MDOT CHART incident fusion.
 *
 * Frederick Scanner is the privacy boundary. A matched CHART row may add
 * official road-impact facts, but it must never replace the scanner's
 * block-level display location or map coordinate with a more precise one.
 * Callers supply the clock so the same inputs always produce the same result.
 */

export const DEFAULT_INCIDENT_MATCH_DISTANCE_METERS = 500;
export const DEFAULT_INCIDENT_MATCH_TIME_MS = 30 * 60_000;
export const DEFAULT_SCANNER_FRESH_FOR_MS = 60 * 60_000;
export const DEFAULT_CHART_FRESH_FOR_MS = 2 * 60 * 60_000;

export type IncidentFusionOptions = {
  /** Explicit clock. The fusion module never reads the system clock. */
  now: string | number | Date;
  maxDistanceMeters?: number;
  maxTimeDeltaMs?: number;
  scannerFreshForMs?: number;
  chartFreshForMs?: number;
};

export type IncidentFreshness = {
  state: "fresh" | "stale" | "unknown";
  ageMs: number | null;
  freshForMs: number;
};

export type IncidentSourceEvidence = {
  source: "frederick-scanner" | "mdot-chart";
  label: "Frederick Scanner" | "MDOT CHART";
  recordId: string;
  firstReportedAt: string;
  lastReportedAt: string;
  freshness: IncidentFreshness;
  confidence: "preliminary" | "official";
};

export type IncidentReasonField =
  | {
      code: "initial-report";
      label: "Initial report";
      value: "Frederick Scanner";
    }
  | {
      code: "mdot-road-report";
      label: "MDOT road report";
      value: "MDOT CHART";
    }
  | {
      code: "lane-impact";
      label: "Lane impact";
      value: string;
    };

export type FusedRoadIncident = {
  id: string;
  kind: PublicIncidentKind;
  status: "preliminary" | "corroborated";
  roadImpact: true;
  scannerClockTime: string;
  firstReportedAt: string;
  lastReportedAt: string;
  updates: number;
  /**
   * The already-sanitized scanner location. CHART's location and description
   * are intentionally absent from this public contract.
   */
  location: string;
  coordinate: {
    lat: number;
    lng: number;
    precision: "block";
    source: "frederick-scanner";
  };
  sources: IncidentSourceEvidence[];
  reasons: IncidentReasonField[];
  officialRoadImpact?: {
    chartId: string;
    type: ChartIncident["type"];
    road: string;
    direction?: string;
    severity: ChartIncident["severity"];
    lanesAffected?: string;
    expectedEnd?: string;
  };
  /**
   * Diagnostic match measurements. They are not display distances because the
   * scanner coordinate represents a block, not an exact incident point.
   */
  match?: {
    chartId: string;
    distanceMeters: number;
    timeDeltaMs: number;
    compatibility: "specific" | "generic-road-incident";
  };
};

export type IncidentFusionResult = {
  incidents: FusedRoadIncident[];
  matchedChartIncidentIds: string[];
  unmatchedChartIncidentIds: string[];
};

type ResolvedOptions = {
  nowMs: number;
  maxDistanceMeters: number;
  maxTimeDeltaMs: number;
  scannerFreshForMs: number;
  chartFreshForMs: number;
};

type ScannerRow = {
  incident: GeocodedIncident;
  id: string;
  location: string;
  firstAtMs: number | null;
  atMs: number | null;
};

type ChartRow = {
  incident: ChartIncident;
  startedAtMs: number | null;
};

type Candidate = {
  scanner: ScannerRow;
  chart: ChartRow;
  distanceMeters: number;
  timeDeltaMs: number;
  compatibility: "specific" | "generic-road-incident";
  roadOverlap: boolean;
};

type IncidentFamily =
  | "collision"
  | "vehicle-fire"
  | "wires"
  | "hazard"
  | "flooding";

const SEVERITY_RANK: Record<ChartIncident["severity"], number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function resolveOptions(options: IncidentFusionOptions): ResolvedOptions {
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : typeof options.now === "number"
        ? options.now
        : Date.parse(options.now);
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("Incident fusion requires a valid explicit clock.");
  }
  return {
    nowMs,
    maxDistanceMeters: finiteNonNegative(
      options.maxDistanceMeters,
      DEFAULT_INCIDENT_MATCH_DISTANCE_METERS,
    ),
    maxTimeDeltaMs: finiteNonNegative(
      options.maxTimeDeltaMs,
      DEFAULT_INCIDENT_MATCH_TIME_MS,
    ),
    scannerFreshForMs: finiteNonNegative(
      options.scannerFreshForMs,
      DEFAULT_SCANNER_FRESH_FOR_MS,
    ),
    chartFreshForMs: finiteNonNegative(
      options.chartFreshForMs,
      DEFAULT_CHART_FRESH_FOR_MS,
    ),
  };
}

function parseTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function freshness(
  reportedAt: string,
  nowMs: number,
  freshForMs: number,
): IncidentFreshness {
  const reportedAtMs = parseTime(reportedAt);
  if (reportedAtMs === null || reportedAtMs > nowMs) {
    return { state: "unknown", ageMs: null, freshForMs };
  }
  const ageMs = nowMs - reportedAtMs;
  return {
    state: ageMs <= freshForMs ? "fresh" : "stale",
    ageMs,
    freshForMs,
  };
}

function validCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/\b(northbound|north|nb)\b/g, " n ")
    .replace(/\b(southbound|south|sb)\b/g, " s ")
    .replace(/\b(eastbound|east|eb)\b/g, " e ")
    .replace(/\b(westbound|west|wb)\b/g, " w ")
    .replace(/\binterstate\s*(\d+)\b/g, " i $1 ")
    .replace(/\bi-?\s*(\d+)\b/g, " i $1 ")
    .replace(/\bu\.?\s*s\.?\s*(?:route)?\s*(\d+)\b/g, " us $1 ")
    .replace(/\bm\.?\s*d\.?\s*(?:route)?\s*(\d+)\b/g, " md $1 ")
    .replace(/\bhighway\b/g, " hwy ")
    .replace(/\bstreet\b/g, " st ")
    .replace(/\bavenue\b/g, " ave ")
    .replace(/\broad\b/g, " rd ")
    .replace(/\bboulevard\b/g, " blvd ")
    .replace(/\bpike\b/g, " pike ")
    .replace(/\bblock\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableHash(value: string): string {
  // FNV-1a is sufficient for a stable UI key. This is not a security boundary.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function scannerId(
  incident: Pick<GeocodedIncident, "kind" | "location" | "firstAt">,
): string {
  return `scanner-${stableHash(
    `${incident.kind}|${normalize(sanitizeLocation(incident.location))}|${incident.firstAt}`,
  )}`;
}

/** Some dispatch rows repeat the same intersection on both sides of a comma
 * ("Rt194 / Detour Rd, Rt194 / Detour Rd"). Keep the privacy sanitization,
 * then remove only exact normalized duplicates so the public label stays
 * readable without guessing at or rewriting the location. */
function publicLocation(value: string): string {
  const safe = sanitizeLocation(value);
  const seen = new Set<string>();
  return safe
    .split(",")
    .map((part) => part.trim())
    .filter((part) => {
      const key = normalize(part);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function scannerRows(
  incidents: readonly GeocodedIncident[],
): ScannerRow[] {
  const byId = new Map<string, ScannerRow>();
  for (const incident of incidents) {
    if (!incident.roadImpact || !validCoordinate(incident.lat, incident.lng)) {
      continue;
    }
    const location = publicLocation(incident.location);
    if (!location) continue;
    const row: ScannerRow = {
      incident,
      id: scannerId(incident),
      location,
      firstAtMs: parseTime(incident.firstAt),
      atMs: parseTime(incident.at),
    };
    const previous = byId.get(row.id);
    if (!previous || compareDuplicateScannerRows(row, previous) < 0) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function compareDuplicateScannerRows(left: ScannerRow, right: ScannerRow): number {
  const leftAt = left.atMs ?? Number.NEGATIVE_INFINITY;
  const rightAt = right.atMs ?? Number.NEGATIVE_INFINITY;
  if (leftAt !== rightAt) return rightAt - leftAt;
  if (left.incident.updates !== right.incident.updates) {
    return right.incident.updates - left.incident.updates;
  }
  return JSON.stringify(left.incident).localeCompare(JSON.stringify(right.incident));
}

function chartRows(incidents: readonly ChartIncident[]): ChartRow[] {
  const byId = new Map<string, ChartRow>();
  for (const incident of incidents) {
    if (!incident.id || !validCoordinate(incident.lat, incident.lng)) continue;
    const row = { incident, startedAtMs: parseTime(incident.started_at) };
    const previous = byId.get(incident.id);
    if (!previous || compareDuplicateChartRows(row, previous) < 0) {
      byId.set(incident.id, row);
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.incident.id.localeCompare(right.incident.id),
  );
}

function compareDuplicateChartRows(left: ChartRow, right: ChartRow): number {
  const severity =
    SEVERITY_RANK[right.incident.severity] -
    SEVERITY_RANK[left.incident.severity];
  if (severity !== 0) return severity;
  const leftAt = left.startedAtMs ?? Number.NEGATIVE_INFINITY;
  const rightAt = right.startedAtMs ?? Number.NEGATIVE_INFINITY;
  if (leftAt !== rightAt) return rightAt - leftAt;
  return JSON.stringify(left.incident).localeCompare(JSON.stringify(right.incident));
}

function scannerFamily(kind: PublicIncidentKind): IncidentFamily | null {
  switch (kind) {
    case "Crash":
    case "Pedestrian struck":
    case "Medevac":
      return "collision";
    case "Vehicle fire":
      return "vehicle-fire";
    case "Wires down":
      return "wires";
    case "Gas leak":
    case "Hazmat":
      return "hazard";
    case "Flooding":
      return "flooding";
    default:
      return null;
  }
}

function chartFamily(incident: ChartIncident): IncidentFamily | null {
  const text = `${incident.type} ${incident.description} ${incident.location}`.toLocaleLowerCase(
    "en-US",
  );
  if (/\b(vehicle|car|auto|truck)\s+fire\b/.test(text)) return "vehicle-fire";
  if (/\b(wires?|utility|power)\s+(?:down|line|pole|fire)|\btransformer\b|\bpole fire\b/.test(text)) {
    return "wires";
  }
  if (/\b(gas (?:leak|main|odor)|hazmat|hazardous|chemical|fuel (?:spill|leak)|spill)\b/.test(text)) {
    return "hazard";
  }
  if (/\b(flood|flooding|high water|water over (?:the )?road)\b/.test(text)) {
    return "flooding";
  }
  if (/\b(crash|collision|accident|overturn|pedestrian struck|cyclist struck)\b/.test(text)) {
    return "collision";
  }
  return null;
}

function compatibility(
  scanner: GeocodedIncident,
  chart: ChartIncident,
): Candidate["compatibility"] | null {
  const expected = scannerFamily(scanner.kind);
  if (!expected) return null;
  const actual = chartFamily(chart);
  if (actual === expected) return "specific";
  if (
    expected === "collision" &&
    actual === null &&
    chart.type === "Incident"
  ) {
    return "generic-road-incident";
  }
  return null;
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceMeters(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number },
): number {
  const earthRadiusMeters = 6_371_008.8;
  const latitudeDelta = radians(right.lat - left.lat);
  const longitudeDelta = radians(right.lng - left.lng);
  const leftLatitude = radians(left.lat);
  const rightLatitude = radians(right.lat);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(a)));
}

function roadTokens(value: string): Set<string> {
  const tokens = normalize(value)
    .split(" ")
    .filter(
      (token) =>
        token.length > 1 &&
        !new Set(["near", "at", "and", "the", "county", "frederick"]).has(token),
    );
  const out = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (["i", "us", "md"].includes(token) && /^\d+$/.test(tokens[index + 1] ?? "")) {
      out.add(`${token}-${tokens[index + 1]}`);
      index += 1;
    } else if (!/^\d+$/.test(token)) {
      out.add(token);
    }
  }
  return out;
}

function roadsOverlap(scanner: ScannerRow, chart: ChartRow): boolean {
  const scannerTokens = roadTokens(scanner.location);
  const chartTokens = roadTokens(
    `${chart.incident.road} ${chart.incident.location} ${chart.incident.description}`,
  );
  for (const token of scannerTokens) {
    if (chartTokens.has(token)) return true;
  }
  return false;
}

function candidates(
  scanners: readonly ScannerRow[],
  charts: readonly ChartRow[],
  options: ResolvedOptions,
): Candidate[] {
  const out: Candidate[] = [];
  for (const scanner of scanners) {
    const scannerTime = scanner.firstAtMs ?? scanner.atMs;
    if (scannerTime === null) continue;
    for (const chart of charts) {
      if (chart.startedAtMs === null) continue;
      const semanticMatch = compatibility(scanner.incident, chart.incident);
      if (!semanticMatch) continue;
      const timeDeltaMs = Math.abs(scannerTime - chart.startedAtMs);
      if (timeDeltaMs > options.maxTimeDeltaMs) continue;
      const separation = distanceMeters(scanner.incident, chart.incident);
      if (separation > options.maxDistanceMeters) continue;
      out.push({
        scanner,
        chart,
        distanceMeters: separation,
        timeDeltaMs,
        compatibility: semanticMatch,
        roadOverlap: roadsOverlap(scanner, chart),
      });
    }
  }
  return out.sort(compareCandidates);
}

function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.compatibility !== right.compatibility) {
    return left.compatibility === "specific" ? -1 : 1;
  }
  if (left.roadOverlap !== right.roadOverlap) {
    return left.roadOverlap ? -1 : 1;
  }
  if (left.distanceMeters !== right.distanceMeters) {
    return left.distanceMeters - right.distanceMeters;
  }
  if (left.timeDeltaMs !== right.timeDeltaMs) {
    return left.timeDeltaMs - right.timeDeltaMs;
  }
  const severity =
    SEVERITY_RANK[right.chart.incident.severity] -
    SEVERITY_RANK[left.chart.incident.severity];
  if (severity !== 0) return severity;
  const scannerIdOrder = left.scanner.id.localeCompare(right.scanner.id);
  if (scannerIdOrder !== 0) return scannerIdOrder;
  return left.chart.incident.id.localeCompare(right.chart.incident.id);
}

function assignMatches(allCandidates: readonly Candidate[]): Map<string, Candidate> {
  const assigned = new Map<string, Candidate>();
  const usedChartIds = new Set<string>();
  for (const candidate of allCandidates) {
    if (
      assigned.has(candidate.scanner.id) ||
      usedChartIds.has(candidate.chart.incident.id)
    ) {
      continue;
    }
    assigned.set(candidate.scanner.id, candidate);
    usedChartIds.add(candidate.chart.incident.id);
  }
  return assigned;
}

function cleanLaneImpact(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || /^(none|n\/?a|unknown|null|undefined)$/i.test(clean)) {
    return undefined;
  }
  return clean.slice(0, 120);
}

function scannerEvidence(
  row: ScannerRow,
  options: ResolvedOptions,
): IncidentSourceEvidence {
  return {
    source: "frederick-scanner",
    label: "Frederick Scanner",
    recordId: row.id,
    firstReportedAt: row.incident.firstAt,
    lastReportedAt: row.incident.at,
    freshness: freshness(
      row.incident.at,
      options.nowMs,
      options.scannerFreshForMs,
    ),
    confidence: "preliminary",
  };
}

function chartEvidence(
  row: ChartRow,
  options: ResolvedOptions,
): IncidentSourceEvidence {
  return {
    source: "mdot-chart",
    label: "MDOT CHART",
    recordId: row.incident.id,
    firstReportedAt: row.incident.started_at,
    lastReportedAt: row.incident.started_at,
    freshness: freshness(
      row.incident.started_at,
      options.nowMs,
      options.chartFreshForMs,
    ),
    confidence: "official",
  };
}

function fusedIncident(
  scanner: ScannerRow,
  match: Candidate | undefined,
  options: ResolvedOptions,
): FusedRoadIncident {
  const sources: IncidentSourceEvidence[] = [scannerEvidence(scanner, options)];
  const reasons: IncidentReasonField[] = [
    {
      code: "initial-report",
      label: "Initial report",
      value: "Frederick Scanner",
    },
  ];
  let officialRoadImpact: FusedRoadIncident["officialRoadImpact"];
  let matchDetails: FusedRoadIncident["match"];

  if (match) {
    const chart = match.chart.incident;
    sources.push(chartEvidence(match.chart, options));
    reasons.push({
      code: "mdot-road-report",
      label: "MDOT road report",
      value: "MDOT CHART",
    });
    const lanesAffected = cleanLaneImpact(chart.lanes_affected);
    if (lanesAffected) {
      reasons.push({
        code: "lane-impact",
        label: "Lane impact",
        value: lanesAffected,
      });
    }
    officialRoadImpact = {
      chartId: chart.id,
      type: chart.type,
      road: chart.road,
      direction: chart.direction,
      severity: chart.severity,
      lanesAffected,
      expectedEnd: chart.expected_end,
    };
    matchDetails = {
      chartId: chart.id,
      distanceMeters: Math.round(match.distanceMeters),
      timeDeltaMs: match.timeDeltaMs,
      compatibility: match.compatibility,
    };
  }

  return {
    id: scanner.id,
    kind: scanner.incident.kind,
    status: match ? "corroborated" : "preliminary",
    roadImpact: true,
    scannerClockTime: scanner.incident.time,
    firstReportedAt: scanner.incident.firstAt,
    lastReportedAt: scanner.incident.at,
    updates: scanner.incident.updates,
    location: scanner.location,
    coordinate: {
      lat: scanner.incident.lat,
      lng: scanner.incident.lng,
      precision: "block",
      source: "frederick-scanner",
    },
    sources,
    reasons,
    officialRoadImpact,
    match: matchDetails,
  };
}

/**
 * Match safe, geocoded Scanner road incidents to compatible MDOT CHART rows.
 * One source record can corroborate at most one scanner incident. Candidate
 * ordering is fully deterministic and independent of input order.
 */
export function fuseScannerWithChartIncidents(
  scannerIncidents: readonly GeocodedIncident[],
  chartIncidents: readonly ChartIncident[],
  options: IncidentFusionOptions,
): IncidentFusionResult {
  const resolved = resolveOptions(options);
  const scanners = scannerRows(scannerIncidents);
  const charts = chartRows(chartIncidents);
  const matches = assignMatches(candidates(scanners, charts, resolved));
  const incidents = scanners
    .map((scanner) => fusedIncident(scanner, matches.get(scanner.id), resolved))
    .sort((left, right) => {
      const timeOrder =
        (parseTime(right.lastReportedAt) ?? Number.NEGATIVE_INFINITY) -
        (parseTime(left.lastReportedAt) ?? Number.NEGATIVE_INFINITY);
      return timeOrder || left.id.localeCompare(right.id);
    });
  const matchedChartIncidentIds = [...new Set(
    [...matches.values()].map((match) => match.chart.incident.id),
  )].sort();
  const matched = new Set(matchedChartIncidentIds);

  return {
    incidents,
    matchedChartIncidentIds,
    unmatchedChartIncidentIds: charts
      .map((row) => row.incident.id)
      .filter((id) => !matched.has(id))
      .sort(),
  };
}
