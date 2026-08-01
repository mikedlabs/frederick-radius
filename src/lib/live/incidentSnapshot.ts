import type { ChartIncidentsResult } from "@/lib/integrations/mdot-chart";
import type { GeocodedIncident } from "@/lib/integrations/scannerIncidents";
import {
  fuseScannerWithChartIncidents,
  type FusedRoadIncident,
  type IncidentFusionResult,
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
  /** Public reports returned by the privacy-filtered Scanner board. */
  reportedCount: number;
  /** Public reports outside this safe, travel-impact map projection. */
  notShownCount: number;
  /** Public reports with a safe coordinate, before the response-size cap. */
  totalCount: number;
  corroboratedCount: number;
  chartAvailable: boolean;
  /** Additive source-health field for clients that can distinguish quiet/fail. */
  scannerAvailable?: boolean;
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

  return buildLiveIncidentSnapshotFromFusion(
    fusion,
    chartResult.available,
    snapshotTime,
  );
}

/** Project an already-computed fusion result into the stable public contract. */
export function buildLiveIncidentSnapshotFromFusion(
  fusion: IncidentFusionResult,
  chartAvailable: boolean,
  now: string | number | Date,
  scannerAvailable?: boolean,
  reportedCount?: number,
): LiveIncidentSnapshot {
  const snapshotTime = resolvedNow(now);
  const totalCount = fusion.incidents.length;
  const safeReportedCount = Math.max(
    totalCount,
    Math.floor(
      typeof reportedCount === "number" && Number.isFinite(reportedCount)
        ? reportedCount
        : totalCount,
    ),
  );
  return {
    items: fusion.incidents
      .slice(0, DEFAULT_LIVE_INCIDENT_LIMIT)
      .map(toPublicSignal),
    reportedCount: safeReportedCount,
    notShownCount: safeReportedCount - totalCount,
    totalCount,
    corroboratedCount: fusion.incidents.filter(
      (incident) => incident.status === "corroborated",
    ).length,
    chartAvailable,
    ...(scannerAvailable === undefined ? {} : { scannerAvailable }),
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
  const [{ getCurrentSituationSnapshot }, { selectLiveIncidentSnapshot }] =
    await Promise.all([
      import("@/lib/live/currentSituation"),
      import("@/lib/live/currentSituationModel"),
    ]);
  return selectLiveIncidentSnapshot(
    await getCurrentSituationSnapshot({ now }),
  );
}
