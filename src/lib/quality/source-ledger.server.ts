import "server-only";
import SOURCE_REGISTRY_RAW from "@/data/source-registry.generated.json" with { type: "json" };
import { getSql } from "@/lib/db/client";
import { feedStatuses } from "@/lib/integrations/feed-registry";
import {
  buildSourceLedger,
  type SourceConfigurationEvidence,
  type SourceEvidence,
  type SourceManifestEntry,
  type SourceLedgerRow,
} from "./source-ledger";

const SOURCE_REGISTRY = SOURCE_REGISTRY_RAW as SourceManifestEntry[];

type RawSql = NonNullable<ReturnType<typeof getSql>>;

function configurationEvidence(): SourceConfigurationEvidence[] {
  const statuses = feedStatuses();
  return [...statuses.keyed, ...statuses.keyless].flatMap((feed) =>
    (feed.sourceIds ?? []).map((sourceId) => ({
      sourceId,
      configured: feed.configured,
      keyless: feed.keyless,
      missingSettings: feed.missingEnvs,
    })),
  );
}

function manifestEvidence(): SourceEvidence[] {
  return SOURCE_REGISTRY.flatMap((source) => {
    if (!source.manifestLastSuccess) return [];
    return [{
      sourceKey: source.id,
      kind: "manifest" as const,
      attemptedAt: source.manifestLastSuccess,
      outcome: "success" as const,
      succeededAt: source.manifestLastSuccess,
      // The manifest proves collection and validation. Publication is
      // deliberately separate and must come from an ingest or artifact.
      publishedAt: null,
      recordCount: null,
    }];
  });
}

async function snapshotEvidence(
  sql: RawSql,
  sourceKeys: string[],
): Promise<SourceEvidence[]> {
  const rows = (await sql`
    WITH wanted(source) AS (
      SELECT unnest(${sourceKeys}::text[])
    )
    SELECT wanted.source,
           latest.taken_at,
           latest.count
    FROM wanted
    JOIN LATERAL (
      SELECT taken_at, count
      FROM feed_snapshots
      WHERE feed_snapshots.source = wanted.source
      ORDER BY taken_at DESC, id DESC
      LIMIT 1
    ) latest ON true
  `) as unknown as Array<{
    source: string;
    taken_at: string | Date;
    count: number;
  }>;
  return rows.map((row) => {
    const at = new Date(row.taken_at).toISOString();
    return {
      sourceKey: row.source,
      kind: "feed_snapshot",
      attemptedAt: at,
      outcome: "success",
      succeededAt: at,
      publishedAt: at,
      recordCount: Number(row.count),
    };
  });
}

async function ingestEvidence(
  sql: RawSql,
  sourceKeys: string[],
): Promise<SourceEvidence[]> {
  const rows = (await sql`
    WITH wanted(source) AS (
      SELECT unnest(${sourceKeys}::text[])
    )
    SELECT wanted.source,
           latest.started_at AS latest_started_at,
           latest.ended_at AS latest_ended_at,
           latest.status AS latest_status,
           latest.records_in AS latest_records_in,
           latest.records_failed AS latest_records_failed,
           latest.error AS latest_error,
           success.started_at AS success_started_at,
           success.ended_at AS success_ended_at,
           success.records_in AS success_records_in
    FROM wanted
    LEFT JOIN LATERAL (
      SELECT started_at, ended_at, status, records_in, records_failed, error
      FROM ingest_runs
      WHERE ingest_runs.source_slug = wanted.source
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT started_at, ended_at, records_in
      FROM ingest_runs
      WHERE ingest_runs.source_slug = wanted.source
        AND status = 'ok'
        AND ended_at IS NOT NULL
        AND coalesce(records_failed, 0) = 0
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    ) success ON true
    WHERE latest.started_at IS NOT NULL OR success.started_at IS NOT NULL
  `) as unknown as Array<{
    source: string;
    latest_started_at: string | Date | null;
    latest_ended_at: string | Date | null;
    latest_status: string | null;
    latest_records_in: number | null;
    latest_records_failed: number | null;
    latest_error: string | null;
    success_started_at: string | Date | null;
    success_ended_at: string | Date | null;
    success_records_in: number | null;
  }>;

  return rows.flatMap((row): SourceEvidence[] => {
    const items: SourceEvidence[] = [];
    const latestStartedAt = row.latest_started_at
      ? new Date(row.latest_started_at).toISOString()
      : null;
    const latestEndedAt = row.latest_ended_at
      ? new Date(row.latest_ended_at).toISOString()
      : null;
    if (latestStartedAt) {
      const completeSuccess =
        row.latest_status === "ok" &&
        latestEndedAt !== null &&
        Number(row.latest_records_failed ?? 0) === 0;
      items.push({
        sourceKey: row.source,
        kind: "ingest_run",
        attemptedAt: latestStartedAt,
        outcome: completeSuccess
          ? "success"
          : row.latest_status === "running"
            ? "running"
            : "failure",
        succeededAt: completeSuccess ? latestEndedAt : null,
        publishedAt: completeSuccess ? latestEndedAt : null,
        recordCount: completeSuccess
          ? Number(row.latest_records_in ?? 0)
          : null,
        error: completeSuccess ? null : row.latest_error ?? row.latest_status,
      });
    }

    const successStartedAt = row.success_started_at
      ? new Date(row.success_started_at).toISOString()
      : null;
    const successEndedAt = row.success_ended_at
      ? new Date(row.success_ended_at).toISOString()
      : null;
    if (
      successStartedAt &&
      successEndedAt &&
      successStartedAt !== latestStartedAt
    ) {
      items.push({
        sourceKey: row.source,
        kind: "ingest_run",
        attemptedAt: successStartedAt,
        outcome: "success",
        succeededAt: successEndedAt,
        publishedAt: successEndedAt,
        recordCount: Number(row.success_records_in ?? 0),
      });
    }
    return items;
  });
}

export async function getSourceHealthLedger(
  options: {
    now?: Date;
    currentEvidence?: readonly SourceEvidence[];
    /**
     * Monitoring callers need evidence-query failures to remain failures.
     * The admin page defaults to fail-soft so one missing operational table
     * does not take down the whole dashboard.
     */
    strictDatabaseEvidence?: boolean;
  } = {},
): Promise<SourceLedgerRow[]> {
  const evidence = [
    ...manifestEvidence(),
    ...(options.currentEvidence ?? []),
  ];
  let sql: RawSql | null = null;
  try {
    sql = getSql();
  } catch (error) {
    if (options.strictDatabaseEvidence) throw error;
    console.warn(
      "[source-ledger] database client initialization failed:",
      error instanceof Error ? error.message : error,
    );
  }

  if (sql) {
    const sourceKeys = [
      ...new Set(
        SOURCE_REGISTRY.flatMap((source) => [
          source.id,
          ...source.evidenceAliases,
        ]),
      ),
    ];
    const failSoft = async (
      label: "snapshot" | "ingest",
      task: Promise<SourceEvidence[]>,
    ): Promise<SourceEvidence[]> => {
      if (options.strictDatabaseEvidence) return task;
      return task.catch((error) => {
        console.warn(
          `[source-ledger] ${label} evidence query failed:`,
          error instanceof Error ? error.message : error,
        );
        return [];
      });
    };
    const [snapshots, ingests] = await Promise.all([
      failSoft("snapshot", snapshotEvidence(sql, sourceKeys)),
      failSoft("ingest", ingestEvidence(sql, sourceKeys)),
    ]);
    evidence.push(...snapshots, ...ingests);
  }

  return buildSourceLedger(
    SOURCE_REGISTRY,
    evidence,
    configurationEvidence(),
    options.now ?? new Date(),
  );
}
