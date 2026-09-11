import {
  chartHeroSentence,
  chartTodayTitle,
  qualifiesForToday,
  type ChartIncidentsResult,
} from "@/lib/integrations/mdot-chart";
import {
  MDOT_WZDX_SOURCE_URL,
  type MdotWorkZone,
  type MdotWorkZonesResult,
} from "@/lib/integrations/mdot-wzdx";
import type {
  NwsAlert,
  NwsAlertsResult,
} from "@/lib/integrations/nws-alerts";
import {
  isLocallyRelevantCivicAlert,
  type OfficialCivicAlert,
  type OfficialCivicAlertsResult,
} from "@/lib/integrations/official-alert-feeds";
import type {
  StopPrediction,
  TransitFeedResult,
  TransitServiceAlert,
} from "@/lib/integrations/transitRealtime";

export const FAIR_ARRIVAL_STATUS_SCHEMA_VERSION = 1 as const;

export const FAIR_ARRIVAL_2026_DATE_RANGE = {
  start: "2026-09-18",
  end: "2026-09-26",
} as const;

const MDOT_CHART_PUBLIC_URL =
  "https://chart.maryland.gov/DataFeeds/GetDataFeeds";
const NWS_FREDERICK_PUBLIC_URL = "https://www.weather.gov/lwx/";
const CIVIC_ALERTS_PUBLIC_URL =
  "https://www.cityoffrederickmd.gov/AlertCenter.aspx";
const COUNTY_TRANSIT_PUBLIC_URL =
  "https://www.frederickcountymd.gov/105/Transit";

const SOURCE_FRESHNESS_MS = {
  chart: 5 * 60_000,
  workZones: 20 * 60_000,
  weather: 20 * 60_000,
  civic: 10 * 60_000,
  transit: 60_000,
} as const;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const MAX_TRANSIT_LOOKAHEAD_MS = 2 * 60 * 60_000;

const FAIR_APPROACH_ROAD_RE =
  /\b(?:I[ -]?70|I[ -]?270|US[ -]?15|US[ -]?40|US[ -]?340|MD[ -]?(?:26|85|144|355))\b/i;
const FAIR_ARRIVAL_CIVIC_RE =
  /\b(?:fairgrounds?|great frederick fair|traffic|road|street|lane|parking|transit|bus|closure|closed|detour|emergency|evacuat\w*|flood\w*|storm|tornado|heat|smoke|air quality)\b/i;

export const FAIR_REALTIME_TRANSIT_STOPS = [
  { id: "162918", label: "Fairground Center" },
  { id: "162919", label: "Hamilton Avenue" },
] as const;

export const FAIR_REALTIME_TRANSIT_ROUTES = {
  "6168": "EFS",
  "9349": "15",
} as const;

export type FairArrivalSourceId =
  | "mdot-chart"
  | "mdot-wzdx"
  | "nws"
  | "civic-alerts"
  | "transit-arrivals"
  | "transit-alerts";

export type FairArrivalSourceState =
  | "current"
  | "partial"
  | "stale"
  | "unavailable";

export type FairArrivalSourceStatus = {
  id: FairArrivalSourceId;
  label: string;
  url: string;
  state: FairArrivalSourceState;
  /** When Radius attempted this source for the response. */
  checkedAt: string;
  /** Provider or feed timestamp used to establish freshness, when available. */
  providerUpdatedAt: string | null;
};

export type FairArrivalEvidence = Pick<
  FairArrivalSourceStatus,
  "id" | "label" | "url" | "state" | "checkedAt" | "providerUpdatedAt"
>;

export type FairArrivalSignal = {
  id: string;
  kind: "traffic" | "work-zone" | "weather" | "civic" | "transit";
  severity: "notice" | "warning" | "critical";
  title: string;
  detail: string;
  observedAt: string | null;
  evidence: FairArrivalEvidence;
};

export type FairTransitArrival = {
  id: string;
  routeLabel: string;
  stopLabel: string;
  expectedAt: string;
  evidence: FairArrivalEvidence;
};

export type FairTransitArrivalStatus = {
  state: "arrivals" | "no-live-arrival" | "unavailable";
  message: string;
  arrivals: FairTransitArrival[];
};

export type FairArrivalStatus = {
  schemaVersion: typeof FAIR_ARRIVAL_STATUS_SCHEMA_VERSION;
  generatedAt: string;
  state: "attention" | "no-current-update" | "partial" | "not-today";
  coverage: "configured-sources-current" | "partial" | "not-checked";
  headline: string;
  summary: string;
  signals: FairArrivalSignal[];
  hiddenSignalCount: number;
  sources: FairArrivalSourceStatus[];
  transit: FairTransitArrivalStatus | null;
  limitsLabel: string;
};

type Checked<T> = {
  result: T;
  checkedAt: string;
};

export type BuildFairArrivalStatusInput = {
  now: Date | string;
  chart: Checked<ChartIncidentsResult>;
  workZones: Checked<MdotWorkZonesResult>;
  weather: Checked<NwsAlertsResult>;
  civic: Checked<OfficialCivicAlertsResult>;
  transit?: {
    arrivals: Checked<TransitFeedResult<StopPrediction[]>>;
    alerts: Checked<TransitFeedResult<TransitServiceAlert[]>>;
  };
};

function frederickDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isFairArrivalDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= FAIR_ARRIVAL_2026_DATE_RANGE.start &&
    value <= FAIR_ARRIVAL_2026_DATE_RANGE.end
  );
}

export function isSelectedFairDateToday(
  selectedDate: string,
  now: Date | string,
): boolean {
  if (!isFairArrivalDate(selectedDate)) return false;
  return selectedDate === frederickDate(clock(now));
}

export function buildFairArrivalNotTodayStatus({
  selectedDate,
  now,
}: {
  selectedDate: string;
  now: Date | string;
}): FairArrivalStatus {
  if (!isFairArrivalDate(selectedDate)) {
    throw new RangeError("Arrival status requires a date inside the 2026 Fair.");
  }
  const current = clock(now);
  return {
    schemaVersion: FAIR_ARRIVAL_STATUS_SCHEMA_VERSION,
    generatedAt: current.toISOString(),
    state: "not-today",
    coverage: "not-checked",
    headline: "Radius will check live arrival feeds on your selected Fair day.",
    summary:
      "The check uses official road, weather, and civic feeds, plus County Transit when you choose it.",
    signals: [],
    hiddenSignalCount: 0,
    sources: [],
    transit: null,
    limitsLabel:
      "Official feeds do not measure Fair attendance, parking-space availability, or gate waits.",
  };
}

function validDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clock(value: Date | string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new RangeError("Fair arrival status requires a valid clock.");
  }
  return parsed;
}

function checkedAt(value: string): string {
  const parsed = validDate(value);
  if (parsed === null) {
    throw new TypeError("Fair arrival source checks require a valid timestamp.");
  }
  return new Date(parsed).toISOString();
}

function sourceStatus({
  id,
  label,
  url,
  available,
  degraded = false,
  checkedAt: attemptedAt,
  providerUpdatedAt,
  now,
  maxAgeMs,
  allowRetrievalFreshness = false,
}: {
  id: FairArrivalSourceId;
  label: string;
  url: string;
  available: boolean;
  degraded?: boolean;
  checkedAt: string;
  providerUpdatedAt?: string;
  now: Date;
  maxAgeMs: number;
  allowRetrievalFreshness?: boolean;
}): FairArrivalSourceStatus {
  const normalizedCheckedAt = checkedAt(attemptedAt);
  const observedMs = validDate(providerUpdatedAt);
  const freshnessMs = observedMs ??
    (allowRetrievalFreshness ? Date.parse(normalizedCheckedAt) : null);
  let state: FairArrivalSourceState;
  if (!available || freshnessMs === null) {
    state = "unavailable";
  } else {
    const ageMs = now.getTime() - freshnessMs;
    state =
      ageMs < -MAX_FUTURE_SKEW_MS || ageMs > maxAgeMs
        ? "stale"
        : degraded
          ? "partial"
          : "current";
  }

  return {
    id,
    label,
    url,
    state,
    checkedAt: normalizedCheckedAt,
    providerUpdatedAt:
      observedMs === null ? null : new Date(observedMs).toISOString(),
  };
}

function cleanText(value: string, maxLength: number): string {
  const clean = value
    .replace(/[—–]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= maxLength) return clean;
  const window = clean.slice(0, maxLength - 1);
  const lastSpace = window.lastIndexOf(" ");
  const end = lastSpace >= Math.floor(maxLength * 0.65) ? lastSpace : maxLength - 1;
  return `${window.slice(0, end).trimEnd()}…`;
}

function sentence(value: string, maxLength: number): string {
  const clean = cleanText(value, maxLength);
  if (!clean) return "Open the official source for details.";
  return /[.!?…]$/.test(clean) ? clean : `${clean}.`;
}

function signalEvidence(
  source: FairArrivalSourceStatus,
  overrides: Partial<Pick<FairArrivalEvidence, "label" | "url">> = {},
): FairArrivalEvidence {
  return {
    ...source,
    ...overrides,
  };
}

function trafficSignals(
  result: ChartIncidentsResult,
  source: FairArrivalSourceStatus,
  now: Date,
): FairArrivalSignal[] {
  if (source.state !== "current" && source.state !== "partial") return [];
  return result.data
    .filter((incident) => qualifiesForToday(incident, now))
    .map((incident) => ({
      id: `chart:${cleanText(incident.id, 120)}`,
      kind: "traffic" as const,
      severity: "critical" as const,
      title: cleanText(chartTodayTitle(incident), 160),
      detail: sentence(chartHeroSentence(incident), 220),
      observedAt: incident.started_at,
      evidence: signalEvidence(source),
    }));
}

function fairApproachWorkZone(zone: MdotWorkZone): boolean {
  return FAIR_APPROACH_ROAD_RE.test(
    [zone.road, ...zone.roadNames].join(" "),
  );
}

function workZoneSignals(
  result: MdotWorkZonesResult,
  source: FairArrivalSourceStatus,
): FairArrivalSignal[] {
  if (source.state !== "current" && source.state !== "partial") return [];
  return result.data
    .filter(
      (zone) =>
        zone.status === "active" &&
        fairApproachWorkZone(zone) &&
        (zone.lanes.summary === "all-lanes-closed" ||
          zone.lanes.summary === "some-lanes-closed"),
    )
    .map((zone) => {
      const laneDetail =
        zone.lanes.summary === "all-lanes-closed"
          ? "All lanes are reported closed."
          : zone.lanes.closed > 0
            ? `${zone.lanes.closed} ${zone.lanes.closed === 1 ? "lane is" : "lanes are"} reported closed.`
            : "A lane closure is reported.";
      return {
        id: `wzdx:${cleanText(zone.id, 120)}`,
        kind: "work-zone" as const,
        severity:
          zone.lanes.summary === "all-lanes-closed"
            ? ("critical" as const)
            : ("warning" as const),
        title: cleanText(`${zone.road} road work`, 160),
        detail: cleanText(
          `${laneDetail} ${sentence(zone.description, 180)}`,
          240,
        ),
        observedAt: zone.updatedAt,
        evidence: signalEvidence(source, { url: zone.sourceUrl }),
      };
    });
}

const NWS_SEVERITY: Record<NwsAlert["severity"], number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
};

function weatherSignals(
  result: NwsAlertsResult,
  source: FairArrivalSourceStatus,
  now: Date,
): FairArrivalSignal[] {
  if (source.state !== "current" && source.state !== "partial") return [];
  return result.alerts
    .filter((alert) => {
      const startsAt = validDate(alert.starts_at);
      const endsAt = validDate(alert.ends_at);
      return (
        startsAt !== null &&
        endsAt !== null &&
        startsAt <= now.getTime() + MAX_FUTURE_SKEW_MS &&
        endsAt > now.getTime()
      );
    })
    .sort(
      (left, right) =>
        NWS_SEVERITY[right.severity] - NWS_SEVERITY[left.severity] ||
        Date.parse(right.starts_at) - Date.parse(left.starts_at),
    )
    .map((alert) => ({
      id: `nws:${cleanText(alert.id, 120)}`,
      kind: "weather" as const,
      severity:
        alert.severity === "Extreme" || alert.severity === "Severe"
          ? ("critical" as const)
          : ("warning" as const),
      title: cleanText(alert.headline || alert.event, 180),
      detail: sentence(`${alert.event} for ${alert.area}`, 220),
      observedAt: alert.starts_at,
      evidence: signalEvidence(source, { url: alert.url }),
    }));
}

function fairArrivalCivicAlert(alert: OfficialCivicAlert): boolean {
  if (!isLocallyRelevantCivicAlert(alert)) return false;
  if (alert.kind === "city-emergency") return true;
  return FAIR_ARRIVAL_CIVIC_RE.test(`${alert.title} ${alert.summary}`);
}

function civicSignals(
  result: OfficialCivicAlertsResult,
  source: FairArrivalSourceStatus,
): FairArrivalSignal[] {
  if (source.state !== "current" && source.state !== "partial") return [];
  return result.alerts
    .filter(fairArrivalCivicAlert)
    .map((alert) => ({
      id: `civic:${cleanText(alert.id, 120)}`,
      kind: "civic" as const,
      severity:
        alert.kind === "city-emergency"
          ? ("critical" as const)
          : ("warning" as const),
      title: cleanText(alert.title, 180),
      detail: sentence(alert.summary, 220),
      observedAt: alert.publishedAt,
      evidence: signalEvidence(source, {
        label: cleanText(alert.provenance.publisher, 100),
        url: alert.url,
      }),
    }));
}

function transitFeedTimestamp<T>(result: TransitFeedResult<T>): string | undefined {
  if (!result.feedTimestamp || !Number.isFinite(result.feedTimestamp)) {
    return undefined;
  }
  return new Date(result.feedTimestamp * 1_000).toISOString();
}

function activeTransitAlert(alert: TransitServiceAlert, nowMs: number): boolean {
  if (alert.activePeriods.length === 0) return true;
  const nowSeconds = Math.floor(nowMs / 1_000);
  return alert.activePeriods.some(
    (period) =>
      (period.start === undefined || period.start <= nowSeconds) &&
      (period.end === undefined || period.end > nowSeconds),
  );
}

function fairTransitAlert(alert: TransitServiceAlert): boolean {
  const stopIds: ReadonlySet<string> = new Set(
    FAIR_REALTIME_TRANSIT_STOPS.map((stop) => stop.id),
  );
  const routeIds: ReadonlySet<string> = new Set(
    Object.keys(FAIR_REALTIME_TRANSIT_ROUTES),
  );
  if (alert.stopIds.length === 0 && alert.routeIds.length === 0) return true;
  return (
    alert.stopIds.some((id) => stopIds.has(id)) ||
    alert.routeIds.some((id) => routeIds.has(id))
  );
}

function transitAlertSignals(
  result: TransitFeedResult<TransitServiceAlert[]>,
  source: FairArrivalSourceStatus,
  now: Date,
): FairArrivalSignal[] {
  if (source.state !== "current" && source.state !== "partial") return [];
  return result.data
    .filter(
      (alert) =>
        fairTransitAlert(alert) && activeTransitAlert(alert, now.getTime()),
    )
    .map((alert) => ({
      id: `transit:${cleanText(alert.id, 120)}`,
      kind: "transit" as const,
      severity: /no service|significant delay|detour|stop moved/i.test(
        alert.effect ?? "",
      )
        ? ("critical" as const)
        : ("warning" as const),
      title: cleanText(alert.header, 180),
      detail: sentence(
        [alert.effect, alert.description].filter(Boolean).join(". "),
        220,
      ),
      observedAt: source.providerUpdatedAt,
      evidence: signalEvidence(source),
    }));
}

function transitArrivalStatus(
  result: TransitFeedResult<StopPrediction[]>,
  source: FairArrivalSourceStatus,
  now: Date,
): FairTransitArrivalStatus {
  if (source.state !== "current" && source.state !== "partial") {
    return {
      state: "unavailable",
      message:
        "Live County Transit arrivals could not be verified. This does not mean service is not running.",
      arrivals: [],
    };
  }

  const stopLabels: ReadonlyMap<string, string> = new Map(
    FAIR_REALTIME_TRANSIT_STOPS.map((stop) => [stop.id, stop.label] as const),
  );
  const routeLabels: Readonly<Record<string, string>> =
    FAIR_REALTIME_TRANSIT_ROUTES;
  const arrivals = result.data
    .flatMap((prediction): FairTransitArrival[] => {
      const stopLabel = stopLabels.get(prediction.stopId);
      const expectedAtMs = prediction.arrivalEpoch
        ? prediction.arrivalEpoch * 1_000
        : NaN;
      if (
        !stopLabel ||
        !Number.isFinite(expectedAtMs) ||
        expectedAtMs < now.getTime() - 30_000 ||
        expectedAtMs > now.getTime() + MAX_TRANSIT_LOOKAHEAD_MS
      ) {
        return [];
      }
      const routeLabel = prediction.routeId
        ? routeLabels[prediction.routeId] ?? "County Transit"
        : "County Transit";
      const predictionId =
        prediction.tripId ??
        prediction.vehicleId ??
        `${prediction.stopId}:${prediction.arrivalEpoch}`;
      return [
        {
          id: cleanText(`arrival:${predictionId}:${prediction.stopId}`, 160),
          routeLabel,
          stopLabel,
          expectedAt: new Date(expectedAtMs).toISOString(),
          evidence: signalEvidence(source),
        },
      ];
    })
    .sort((left, right) => Date.parse(left.expectedAt) - Date.parse(right.expectedAt))
    .slice(0, 3);

  if (arrivals.length === 0) {
    return {
      state: "no-live-arrival",
      message:
        "No live Fair-stop arrival was returned right now. This does not mean service is not running.",
      arrivals: [],
    };
  }
  return {
    state: "arrivals",
    message:
      "These are live estimates from County Transit, not scheduled guarantees.",
    arrivals,
  };
}

const SIGNAL_PRIORITY: Record<FairArrivalSignal["severity"], number> = {
  critical: 3,
  warning: 2,
  notice: 1,
};

function sortedSignals(signals: FairArrivalSignal[]): FairArrivalSignal[] {
  return [...signals].sort(
    (left, right) =>
      SIGNAL_PRIORITY[right.severity] - SIGNAL_PRIORITY[left.severity] ||
      (validDate(right.observedAt) ?? Number.NEGATIVE_INFINITY) -
        (validDate(left.observedAt) ?? Number.NEGATIVE_INFINITY) ||
      left.id.localeCompare(right.id),
  );
}

/**
 * Builds a public Fair-arrival response from narrowly scoped official evidence.
 * Successful empty feeds remain bounded observations, and a failed or stale
 * feed always remains unknown. This contract has no field for attendance,
 * parking availability, gate waits, or a recommended departure time.
 */
export function buildFairArrivalStatus(
  input: BuildFairArrivalStatusInput,
): FairArrivalStatus {
  const now = clock(input.now);
  const chartSource = sourceStatus({
    id: "mdot-chart",
    label: "MDOT CHART traffic",
    url: MDOT_CHART_PUBLIC_URL,
    available: input.chart.result.available,
    checkedAt: input.chart.checkedAt,
    providerUpdatedAt: input.chart.result.asOf,
    now,
    maxAgeMs: SOURCE_FRESHNESS_MS.chart,
    allowRetrievalFreshness: true,
  });
  const workZoneSource = sourceStatus({
    id: "mdot-wzdx",
    label: "Maryland WZDx road work",
    url: MDOT_WZDX_SOURCE_URL,
    available: input.workZones.result.available,
    checkedAt: input.workZones.checkedAt,
    providerUpdatedAt: input.workZones.result.asOf,
    now,
    maxAgeMs: SOURCE_FRESHNESS_MS.workZones,
  });
  const weatherSource = sourceStatus({
    id: "nws",
    label: "National Weather Service",
    url: NWS_FREDERICK_PUBLIC_URL,
    available: input.weather.result.available,
    checkedAt: input.weather.checkedAt,
    providerUpdatedAt: input.weather.result.checkedAt,
    now,
    maxAgeMs: SOURCE_FRESHNESS_MS.weather,
  });
  const civicSource = sourceStatus({
    id: "civic-alerts",
    label: "City and County alert feeds",
    url: CIVIC_ALERTS_PUBLIC_URL,
    available: input.civic.result.available,
    degraded: input.civic.result.degraded,
    checkedAt: input.civic.checkedAt,
    now,
    maxAgeMs: SOURCE_FRESHNESS_MS.civic,
    allowRetrievalFreshness: true,
  });

  const sources: FairArrivalSourceStatus[] = [
    chartSource,
    workZoneSource,
    weatherSource,
    civicSource,
  ];
  const signals = [
    ...trafficSignals(input.chart.result, chartSource, now),
    ...workZoneSignals(input.workZones.result, workZoneSource),
    ...weatherSignals(input.weather.result, weatherSource, now),
    ...civicSignals(input.civic.result, civicSource),
  ];

  let transit: FairTransitArrivalStatus | null = null;
  if (input.transit) {
    const transitArrivalSource = sourceStatus({
      id: "transit-arrivals",
      label: "County Transit live arrivals",
      url: COUNTY_TRANSIT_PUBLIC_URL,
      available: input.transit.arrivals.result.available,
      checkedAt: input.transit.arrivals.checkedAt,
      providerUpdatedAt: transitFeedTimestamp(input.transit.arrivals.result),
      now,
      maxAgeMs: SOURCE_FRESHNESS_MS.transit,
    });
    const transitAlertSource = sourceStatus({
      id: "transit-alerts",
      label: "County Transit service alerts",
      url: COUNTY_TRANSIT_PUBLIC_URL,
      available: input.transit.alerts.result.available,
      checkedAt: input.transit.alerts.checkedAt,
      providerUpdatedAt: transitFeedTimestamp(input.transit.alerts.result),
      now,
      maxAgeMs: SOURCE_FRESHNESS_MS.transit,
    });
    sources.push(transitArrivalSource, transitAlertSource);
    transit = transitArrivalStatus(
      input.transit.arrivals.result,
      transitArrivalSource,
      now,
    );
    signals.push(
      ...transitAlertSignals(
        input.transit.alerts.result,
        transitAlertSource,
        now,
      ),
    );
  }

  const ordered = sortedSignals(signals);
  const publicSignals = ordered.slice(0, 6);
  const allSourcesCurrent = sources.every(
    (source) => source.state === "current",
  );
  const coverage = allSourcesCurrent
    ? "configured-sources-current"
    : "partial";
  const state =
    publicSignals.length > 0
      ? "attention"
      : allSourcesCurrent
        ? "no-current-update"
        : "partial";

  return {
    schemaVersion: FAIR_ARRIVAL_STATUS_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    state,
    coverage,
    headline:
      state === "attention"
        ? `${publicSignals.length} ${publicSignals.length === 1 ? "official update may" : "official updates may"} affect your trip.`
        : state === "no-current-update"
          ? "No major arrival update is published in the feeds Radius checked."
          : "Some live arrival information could not be verified.",
    summary:
      state === "attention"
        ? allSourcesCurrent
          ? "Review the current official details before you leave."
          : "Review the current updates and recheck the unavailable sources before you leave."
        : state === "no-current-update"
          ? "This describes only the official feeds Radius checked. It is not an all-clear."
          : "An unavailable or stale feed is unknown, not an all-clear.",
    signals: publicSignals,
    hiddenSignalCount: Math.max(0, ordered.length - publicSignals.length),
    sources,
    transit,
    limitsLabel:
      "Official feeds do not measure Fair attendance, parking-space availability, or gate waits.",
  };
}

export function isFairArrivalStatus(value: unknown): value is FairArrivalStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FairArrivalStatus>;
  return (
    candidate.schemaVersion === FAIR_ARRIVAL_STATUS_SCHEMA_VERSION &&
    typeof candidate.generatedAt === "string" &&
    (candidate.state === "attention" ||
      candidate.state === "no-current-update" ||
      candidate.state === "partial" ||
      candidate.state === "not-today") &&
    Array.isArray(candidate.signals) &&
    Array.isArray(candidate.sources) &&
    typeof candidate.headline === "string" &&
    typeof candidate.summary === "string"
  );
}
