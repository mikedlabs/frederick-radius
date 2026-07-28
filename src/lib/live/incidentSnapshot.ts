import type {
  ChartIncident,
  ChartIncidentsResult,
} from "@/lib/integrations/mdot-chart";
import { getChartIncidentsFrederickResult } from "@/lib/integrations/mdot-chart";
import type { GeocodedIncident } from "@/lib/integrations/scannerIncidents";
import { getGeocodedScannerIncidents } from "@/lib/integrations/scannerIncidents";
import {
  fuseScannerWithChartIncidents,
  type FusedRoadIncident,
  type IncidentReasonField,
  type IncidentSourceEvidence,
} from "@/lib/live/incidentFusion";

export const DEFAULT_LIVE_INCIDENT_LIMIT = 12;

/**
 * The public incident contract intentionally omits fusion diagnostics such as
 * the distance between source coordinates. Scanner's block-level coordinate
 * remains the only coordinate exposed to clients.
 */
export type LiveIncidentSignal = {
  id: FusedRoadIncident["id"];
  kind: FusedRoadIncident["kind"];
  status: FusedRoadIncident["status"];
  roadImpact: true;
  scannerClockTime: FusedRoadIncident["scannerClockTime"];
  firstReportedAt: FusedRoadIncident["firstReportedAt"];
  lastReportedAt: FusedRoadIncident["lastReportedAt"];
  updates: FusedRoadIncident["updates"];
  location: FusedRoadIncident["location"];
  coordinate: FusedRoadIncident["coordinate"];
  sources: IncidentSourceEvidence[];
  reasons: IncidentReasonField[];
  officialRoadImpact?: FusedRoadIncident["officialRoadImpact"];
};

export type LiveIncidentSnapshot = {
  items: LiveIncidentSignal[];
  totalCount: number;
  corroboratedCount: number;
  chartAvailable: boolean;
  updatedAt: string;
};

function resolvedNow(value: string | number | Date): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Live incident snapshots require a valid explicit clock.");
  }
  return date;
}

function toPublicSignal(incident: FusedRoadIncident): LiveIncidentSignal {
  return {
    id: incident.id,
    kind: incident.kind,
    status: incident.status,
    roadImpact: true,
    scannerClockTime: incident.scannerClockTime,
    firstReportedAt: incident.firstReportedAt,
    lastReportedAt: incident.lastReportedAt,
    updates: incident.updates,
    location: incident.location,
    coordinate: { ...incident.coordinate },
    sources: incident.sources.map((source) => ({
      ...source,
      freshness: { ...source.freshness },
    })),
    reasons: incident.reasons.map((reason) => ({ ...reason })),
    officialRoadImpact: incident.officialRoadImpact
      ? { ...incident.officialRoadImpact }
      : undefined,
  };
}

/**
 * Build the safe client snapshot from source rows that a server surface has
 * already fetched. This lets Pulse reuse its existing CHART request instead of
 * issuing a duplicate network call.
 *
 * An empty items array means only that no public, geocoded road reports
 * were returned. It is not an all-clear state.
 */
export function buildLiveIncidentSnapshot(
  scannerIncidents: readonly GeocodedIncident[],
  chartResult: ChartIncidentsResult,
  now: string | number | Date,
): LiveIncidentSnapshot {
  const snapshotTime = resolvedNow(now);
  const fusion = fuseScannerWithChartIncidents(
    scannerIncidents,
    chartResult.data,
    {
      now: snapshotTime,
    },
  );

  return {
    items: fusion.incidents
      .slice(0, DEFAULT_LIVE_INCIDENT_LIMIT)
      .map(toPublicSignal),
    totalCount: fusion.incidents.length,
    corroboratedCount: fusion.incidents.filter(
      (incident) => incident.status === "corroborated",
    ).length,
    chartAvailable: chartResult.available,
    updatedAt: snapshotTime.toISOString(),
  };
}

export type GetLiveIncidentSnapshotOptions = {
  now?: string | number | Date;
};

/**
 * Fetch the two sources concurrently, then reduce them to the public snapshot.
 * Both integrations fail soft, but CHART's availability remains explicit.
 */
export async function getLiveIncidentSnapshot({
  now,
}: GetLiveIncidentSnapshotOptions = {}): Promise<LiveIncidentSnapshot> {
  const [scannerIncidents, chartResult] = await Promise.all([
    getGeocodedScannerIncidents().catch(() => [] as GeocodedIncident[]),
    getChartIncidentsFrederickResult().catch(() => ({
      data: [] as ChartIncident[],
      available: false,
    })),
  ]);

  return buildLiveIncidentSnapshot(
    scannerIncidents,
    chartResult,
    now ?? new Date(),
  );
}
