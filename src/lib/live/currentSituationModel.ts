import type { AqiObservation } from "@/lib/integrations/airnow";
import type { FcpsAlert } from "@/lib/integrations/fcps";
import type { FrederickOutages } from "@/lib/integrations/firstenergy";
import type {
  ChartIncident,
  ChartIncidentsResult,
} from "@/lib/integrations/mdot-chart";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { PulsePointIncident } from "@/lib/integrations/pulsepoint";
import type { GeocodedIncident } from "@/lib/integrations/scannerIncidents";
import {
  buildLiveIncidentSnapshotFromFusion,
  type LiveIncidentSnapshot,
} from "@/lib/live/incidentSnapshot";
import {
  fuseScannerWithChartIncidents,
  type IncidentFusionResult,
} from "@/lib/live/incidentFusion";

export const CURRENT_SITUATION_SCHEMA_VERSION = 1 as const;

export type SituationSourceId =
  | "nws"
  | "fcps"
  | "mdot-chart"
  | "frederick-scanner"
  | "firstenergy"
  | "pulsepoint"
  | "airnow";

export type SourceAvailability = "available" | "unavailable" | "disabled";
export type SourceFreshness = "fresh" | "stale" | "unknown";
export type SourceAsOfBasis = "provider" | "retrieval" | "observation";

export type SourceEnvelope<T> = {
  source: SituationSourceId;
  data: T;
  availability: SourceAvailability;
  freshness: SourceFreshness;
  requiredForQuiet: boolean;
  asOf: string | null;
  asOfBasis: SourceAsOfBasis | null;
  capturedAt: string;
  staleAfterSeconds: number;
  itemCount: number;
};

export type SourceEnvelopeOptions<T> = {
  source: SituationSourceId;
  data: T;
  availability: SourceAvailability;
  requiredForQuiet: boolean;
  capturedAt: string | number | Date;
  staleAfterSeconds: number;
  asOf?: string | null;
  asOfBasis?: SourceAsOfBasis | null;
  itemCount?: number;
};

export type CurrentSituationSources = {
  weather: SourceEnvelope<NwsAlert[]>;
  schools: SourceEnvelope<FcpsAlert[]>;
  traffic: SourceEnvelope<ChartIncident[]>;
  scanner: SourceEnvelope<GeocodedIncident[]>;
  power: SourceEnvelope<FrederickOutages>;
  fireRescue: SourceEnvelope<PulsePointIncident[]>;
  air: SourceEnvelope<AqiObservation[]>;
};

export type SituationSummary = {
  status: "active" | "quiet" | "unknown";
  coverage: "complete" | "partial";
  tone: "alert" | "caution" | "quiet";
  activeCount: number;
  activeByCategory: {
    weather: number;
    schools: number;
    roads: number;
    power: number;
    fireRescue: number;
    air: number;
  };
  degradedSources: SituationSourceId[];
};

export type CurrentSituationSnapshot = {
  schemaVersion: typeof CURRENT_SITUATION_SCHEMA_VERSION;
  snapshotId: string;
  generatedAt: string;
  sources: CurrentSituationSources;
  roads: {
    live: LiveIncidentSnapshot;
    matchedOfficialIds: string[];
    unmatchedOfficial: ChartIncident[];
  };
  summary: SituationSummary;
};

export type BuildCurrentSituationOptions = {
  sources: CurrentSituationSources;
  roadFusion: IncidentFusionResult;
  now: string | number | Date;
};

const MAX_FUTURE_SKEW_MS = 5 * 60_000;

function resolvedDate(value: string | number | Date, label: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(`${label} requires a valid explicit clock.`);
  }
  return date;
}

function itemCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 1;
}

/**
 * Wrap one source read without collapsing "quiet", "failed", and "disabled"
 * into the same empty array. Freshness is derived only from the stated as-of
 * timestamp; callers must label whether that timestamp came from the provider,
 * an observation, or the retrieval itself.
 */
export function sourceEnvelope<T>({
  source,
  data,
  availability,
  requiredForQuiet,
  capturedAt,
  staleAfterSeconds,
  asOf = null,
  asOfBasis = null,
  itemCount: explicitItemCount,
}: SourceEnvelopeOptions<T>): SourceEnvelope<T> {
  const captured = resolvedDate(capturedAt, "Source envelopes");
  const safeStaleAfter = Number.isFinite(staleAfterSeconds) && staleAfterSeconds >= 0
    ? staleAfterSeconds
    : 0;
  const asOfMs = asOf ? Date.parse(asOf) : NaN;
  let freshness: SourceFreshness = "unknown";
  if (availability === "available" && Number.isFinite(asOfMs)) {
    const ageMs = captured.getTime() - asOfMs;
    if (ageMs >= -MAX_FUTURE_SKEW_MS) {
      freshness = ageMs <= safeStaleAfter * 1_000 ? "fresh" : "stale";
    }
  }

  return {
    source,
    data,
    availability,
    freshness,
    requiredForQuiet,
    asOf: Number.isFinite(asOfMs) ? new Date(asOfMs).toISOString() : null,
    asOfBasis: Number.isFinite(asOfMs) ? asOfBasis : null,
    capturedAt: captured.toISOString(),
    staleAfterSeconds: safeStaleAfter,
    itemCount: explicitItemCount ?? itemCount(data),
  };
}

function sourceIsFresh(source: SourceEnvelope<unknown>): boolean {
  return source.availability === "available" && source.freshness === "fresh";
}

/**
 * Preserve the difference between a current source, a failed/stale source, and
 * an integration that is deliberately not connected. Presentation layers must
 * not turn `disabled` into a verified empty result.
 */
export function sourceDisplayState(
  source: Pick<SourceEnvelope<unknown>, "availability" | "freshness">,
): "current" | "disabled" | "unavailable" {
  if (source.availability === "disabled") return "disabled";
  return source.availability === "available" && source.freshness === "fresh"
    ? "current"
    : "unavailable";
}

function activeWeather(alerts: readonly NwsAlert[], nowMs: number): NwsAlert[] {
  return alerts.filter((alert) => {
    const endsAt = Date.parse(alert.ends_at);
    return !Number.isFinite(endsAt) || endsAt > nowMs;
  });
}

function currentSchoolNotices(alerts: readonly FcpsAlert[]): FcpsAlert[] {
  const ordered = [...alerts].sort((left, right) => {
    const leftAt = Date.parse(left.published_at);
    const rightAt = Date.parse(right.published_at);
    const byTime =
      (Number.isFinite(rightAt) ? rightAt : Number.NEGATIVE_INFINITY) -
      (Number.isFinite(leftAt) ? leftAt : Number.NEGATIVE_INFINITY);
    return byTime || left.id.localeCompare(right.id);
  });
  const currentStatus = ordered[0]?.status;
  if (
    currentStatus !== "closed" &&
    currentStatus !== "delayed" &&
    currentStatus !== "early_dismissal"
  ) {
    return [];
  }
  return ordered.filter((alert) => alert.status === currentStatus);
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function snapshotId(sources: CurrentSituationSources, generatedAt: string): string {
  const identity = Object.values(sources)
    .map((source) =>
      [
        source.source,
        source.availability,
        source.freshness,
        source.asOf ?? "",
        source.itemCount,
      ].join(":"),
    )
    .join("|");
  return `situation-${stableHash(`${generatedAt}|${identity}`)}`;
}

export function buildCurrentSituationSnapshot({
  sources,
  roadFusion,
  now,
}: BuildCurrentSituationOptions): CurrentSituationSnapshot {
  const clock = resolvedDate(now, "Current situation snapshots");
  const nowMs = clock.getTime();

  const weather = sourceIsFresh(sources.weather)
    ? activeWeather(sources.weather.data, nowMs)
    : [];
  const schools = sourceIsFresh(sources.schools)
    ? currentSchoolNotices(sources.schools.data)
    : [];
  const roads = sourceIsFresh(sources.traffic)
    ? sources.traffic.data.filter((incident) => incident.severity === "High")
    : [];
  const power =
    sourceIsFresh(sources.power) && sources.power.data.total_out >= 25 ? 1 : 0;
  const fireRescue = sourceIsFresh(sources.fireRescue)
    ? sources.fireRescue.data.filter((incident) => incident.severity === "severe")
    : [];
  const worstAirCategory = sourceIsFresh(sources.air)
    ? Math.max(0, ...sources.air.data.map((observation) => observation.category.id))
    : 0;
  const air = worstAirCategory >= 3 ? 1 : 0;

  const activeByCategory = {
    weather: weather.length,
    schools: schools.length,
    roads: roads.length,
    power,
    fireRescue: fireRescue.length,
    air,
  };
  const activeCount = Object.values(activeByCategory).reduce(
    (sum, count) => sum + count,
    0,
  );
  const degradedSources = Object.values(sources)
    .filter(
      (source) =>
        source.requiredForQuiet &&
        (source.availability !== "available" || source.freshness !== "fresh"),
    )
    .map((source) => source.source);
  const coverage = degradedSources.length === 0 ? "complete" : "partial";
  const status =
    activeCount > 0 ? "active" : coverage === "complete" ? "quiet" : "unknown";
  const tone =
    weather.length > 0 ||
    roads.length > 0 ||
    power > 0 ||
    fireRescue.length > 0 ||
    worstAirCategory >= 4
      ? "alert"
      : schools.length > 0 || air > 0
        ? "caution"
        : "quiet";

  const scannerIsFresh = sourceIsFresh(sources.scanner);
  const trafficIsFresh = sourceIsFresh(sources.traffic);
  // A caller may have fused rows before freshness was known. Rebuild the
  // projection whenever either source is degraded so stale official evidence
  // can never leave a Scanner item marked as corroborated.
  const safeRoadFusion =
    scannerIsFresh && trafficIsFresh
      ? roadFusion
      : fuseScannerWithChartIncidents(
          scannerIsFresh ? sources.scanner.data : [],
          trafficIsFresh ? sources.traffic.data : [],
          { now: clock },
        );
  const matchedOfficialIds = [...safeRoadFusion.matchedChartIncidentIds];
  const matched = new Set(matchedOfficialIds);
  const generatedAt = clock.toISOString();

  return {
    schemaVersion: CURRENT_SITUATION_SCHEMA_VERSION,
    snapshotId: snapshotId(sources, generatedAt),
    generatedAt,
    sources,
    roads: {
      live: buildLiveIncidentSnapshotFromFusion(
        safeRoadFusion,
        trafficIsFresh,
        clock,
        scannerIsFresh,
      ),
      matchedOfficialIds,
      unmatchedOfficial: trafficIsFresh
        ? sources.traffic.data.filter((incident) => !matched.has(incident.id))
        : [],
    },
    summary: {
      status,
      coverage,
      tone,
      activeCount,
      activeByCategory,
      degradedSources,
    },
  };
}

/** Stable legacy projection consumed by the header status endpoint. */
export function selectPulseStatus(snapshot: CurrentSituationSnapshot): {
  active: boolean;
  count: number;
  tone: SituationSummary["tone"];
  ok: boolean;
  lastUpdated: string;
} {
  return {
    active: snapshot.summary.status === "active",
    count: snapshot.summary.activeCount,
    tone: snapshot.summary.tone,
    ok: snapshot.summary.coverage === "complete",
    lastUpdated: snapshot.generatedAt,
  };
}

/** Stable legacy projection consumed by /api/pulse/incidents. */
export function selectLiveIncidentSnapshot(
  snapshot: CurrentSituationSnapshot,
): LiveIncidentSnapshot {
  return snapshot.roads.live;
}

/**
 * Road layers share one projection, but the official layer remains complete.
 *
 * Scanner incidents are opt-in on the map. Removing a corroborated CHART row
 * here made that incident disappear whenever the Scanner layer was off. Keep
 * every official row visible; the client can deduplicate only when both
 * visual layers are active.
 */
export function selectMapRoadPins(snapshot: CurrentSituationSnapshot): {
  live: LiveIncidentSnapshot["items"];
  official: ChartIncident[];
} {
  return {
    live: snapshot.roads.live.items,
    official: sourceIsFresh(snapshot.sources.traffic)
      ? snapshot.sources.traffic.data
      : [],
  };
}

/** Compatibility result for Ask's existing road-status answer builder. */
export function selectChartIncidentsResult(
  snapshot: CurrentSituationSnapshot,
): ChartIncidentsResult {
  const source = snapshot.sources.traffic;
  const available = sourceIsFresh(source);
  return {
    data: available ? source.data : [],
    available,
    ...(source.asOf ? { asOf: source.asOf } : {}),
  };
}
