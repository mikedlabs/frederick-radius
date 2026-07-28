import BUSINESS_INFO_RAW from "@/data/business-info.json" with { type: "json" };
import MUNICIPAL_CIVIC_RAW from "@/data/municipal-civic.json" with { type: "json" };
import TRANSIT_RAW from "@/data/transit.json" with { type: "json" };
import VENUE_EVENTS_RAW from "@/data/venue-events.json" with { type: "json" };
import type { SourceEvidence } from "./source-ledger";

type TimestampedSource = {
  source?: { fetchedAt?: unknown };
};

type TransitArtifact = {
  generatedAt?: unknown;
  routes?: unknown;
};

export type ArtifactEvidenceInput = {
  sourceKey: string;
  timestamps: readonly unknown[];
  recordCount: number;
  /**
   * Row-backed artifacts need one valid timestamp per published record. A
   * single generated-at timestamp may cover an entire atomic artifact (for
   * example, the transit GTFS snapshot).
   */
  timestampCoverage?: "records" | "artifact";
};

function oldestTimestamp(values: readonly unknown[]): string | null {
  let oldest: { iso: string; time: number } | null = null;
  for (const value of values) {
    if (typeof value !== "string") return null;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return null;
    if (!oldest || time < oldest.time) {
      oldest = { iso: new Date(time).toISOString(), time };
    }
  }
  return oldest?.iso ?? null;
}

/**
 * Embedded timestamps are conservative publication proof. Row-backed
 * artifacts use the oldest row only when every published row is timestamped,
 * so a newly refreshed record cannot make an otherwise stale batch look
 * current. Atomic artifacts may use one generated-at timestamp for the whole
 * file. File mtimes and deployment time never count, so a no-op build cannot
 * manufacture freshness.
 */
export function buildSourceArtifactEvidence(
  inputs: readonly ArtifactEvidenceInput[],
): SourceEvidence[] {
  return inputs.flatMap((input) => {
    const recordCount = Number.isFinite(input.recordCount)
      ? Math.max(0, Math.floor(input.recordCount))
      : 0;
    const timestampCoverage = input.timestampCoverage ?? "records";
    if (
      timestampCoverage === "records"
      && input.timestamps.length !== recordCount
    ) {
      return [];
    }
    const publishedAt = oldestTimestamp(input.timestamps);
    if (!publishedAt) return [];
    return [{
      sourceKey: input.sourceKey,
      kind: "artifact" as const,
      attemptedAt: publishedAt,
      outcome: "success" as const,
      succeededAt: publishedAt,
      publishedAt,
      recordCount,
    }];
  });
}

export function bundledSourceArtifactEvidence(): SourceEvidence[] {
  const businessInfo = BUSINESS_INFO_RAW as Record<string, TimestampedSource>;
  const municipalCivic =
    MUNICIPAL_CIVIC_RAW as Record<string, TimestampedSource>;
  const venueEvents = VENUE_EVENTS_RAW as TimestampedSource[];
  const transit = TRANSIT_RAW as TransitArtifact;
  const transitRoutes = Array.isArray(transit.routes)
    ? transit.routes.length
    : 0;

  return buildSourceArtifactEvidence([
    {
      sourceKey: "business_info_extraction",
      timestamps: Object.values(businessInfo).map(
        (row) => row.source?.fetchedAt,
      ),
      recordCount: Object.keys(businessInfo).length,
    },
    {
      sourceKey: "municipal_civic_extraction",
      timestamps: Object.values(municipalCivic).map(
        (row) => row.source?.fetchedAt,
      ),
      recordCount: Object.keys(municipalCivic).length,
    },
    {
      sourceKey: "venue_event_extraction",
      timestamps: venueEvents.map((row) => row.source?.fetchedAt),
      recordCount: venueEvents.length,
    },
    {
      sourceKey: "transit_gtfs",
      timestamps: [transit.generatedAt],
      recordCount: transitRoutes,
      timestampCoverage: "artifact",
    },
  ]);
}
