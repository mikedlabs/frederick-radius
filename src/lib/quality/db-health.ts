/**
 * Database-health probes for the nightly data-health cron + admin dashboard.
 *
 * These read the RAW-SQL ingestion/security surface that is deliberately NOT
 * modeled in src/lib/db/schema.ts (the ingestion tables + RLS posture live
 * only in the hand-applied migrations — see drizzle/README.md), so they go
 * through the raw postgres-js handle (getSql) rather than Drizzle.
 *
 * Dashboard-only readers remain FAIL-SOFT so an admin page can still render
 * without a database. The nightly cron uses evaluateDbHealth(), which is
 * deliberately status-aware: missing configuration or a failed query becomes
 * an explicit infrastructure anomaly instead of an all-clear empty result.
 */
import "server-only";
import { getSql } from "@/lib/db/client";
import type { Anomaly } from "@/lib/integrations/feed-snapshot";

type RawSql = NonNullable<ReturnType<typeof getSql>>;

export type DbHealthStatus = "available" | "unavailable";
export type DbHealthUnavailableReason = "not_configured" | "query_failed";
export type DbHealthEvaluation = {
  status: DbHealthStatus;
  reason: DbHealthUnavailableReason | null;
  anomalies: Anomaly[];
};

function infrastructureUnavailable(
  reason: DbHealthUnavailableReason,
): DbHealthEvaluation {
  return {
    status: "unavailable",
    reason,
    anomalies: [
      {
        source: "database",
        kind: "infrastructure_unavailable",
        detail:
          reason === "not_configured"
            ? "Database health could not be evaluated because no database connection URL is configured."
            : "Database health could not be evaluated because a required health query failed. Check the data-health cron logs and database connectivity.",
      },
    ],
  };
}

async function queryRlsUnprotectedTables(sql: RawSql): Promise<string[]> {
  const rows = (await sql`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
    ORDER BY c.relname
  `) as unknown as Array<{ relname: string }>;
  return rows.map((r) => r.relname);
}

/**
 * mig-6 — RLS-coverage guard. The security model is deny-all RLS on every
 * public table (drizzle/0007, 0009): all reads/writes go through Drizzle on a
 * BYPASSRLS role, never the public anon/PostgREST role. A table hand-added
 * WITHOUT `ENABLE ROW LEVEL SECURITY` silently re-opens the anon read/write
 * hole. Returns the names of any public base table with RLS disabled.
 */
export async function findRlsUnprotectedTables(): Promise<string[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    return await queryRlsUnprotectedTables(sql);
  } catch (err) {
    console.warn(
      "[db-health] RLS coverage check failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/** mig-6, as alert-shaped anomalies for the cron's existing Slack path. */
export async function findRlsAnomalies(): Promise<Anomaly[]> {
  const tables = await findRlsUnprotectedTables();
  return tables.map((t) => ({
    source: t,
    kind: "rls_unprotected" as const,
    detail: `public.${t} has RLS DISABLED — the anon/PostgREST role can read/write it. Run "ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;" in the Supabase SQL editor.`,
  }));
}

/** A source that exists in ingested_events but hasn't refreshed within this
 *  many hours is treated as stale (a daily cron that has silently died). */
const INGEST_STALE_HOURS = 36;

async function queryStaleIngestSources(
  sql: RawSql,
  maxAgeHours: number,
): Promise<Anomaly[]> {
  const rows = (await sql`
    SELECT source_domain, max(updated_at) AS last
    FROM ingested_events
    GROUP BY source_domain
  `) as unknown as Array<{ source_domain: string; last: string | Date | null }>;
  const cutoff = Date.now() - maxAgeHours * 3_600_000;
  const out: Anomaly[] = [];
  for (const r of rows) {
    const lastMs = r.last ? new Date(r.last).getTime() : 0;
    if (lastMs < cutoff) {
      const ageH = lastMs ? Math.round((Date.now() - lastMs) / 3_600_000) : null;
      out.push({
        source: r.source_domain,
        kind: "ingest_stale",
        detail: ageH
          ? `No ingest in ~${ageH}h (last ${new Date(lastMs).toISOString()}); the cron for this source may be dead.`
          : `Source present in ingested_events but has no updated_at — ingest may be broken.`,
      });
    }
  }
  return out;
}

/**
 * ING-5 — dead-feed freshness. Flags any ingest source whose newest
 * `ingested_events` row is older than `maxAgeHours` (a CivicEngage/FCPL/FCVFRA
 * cron that quietly stopped writing — the DFP/Hood-style silent retirement).
 * Returns alert-shaped anomalies; empty when the table is empty or unavailable.
 */
export async function findStaleIngestSources(
  maxAgeHours = INGEST_STALE_HOURS,
): Promise<Anomaly[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    return await queryStaleIngestSources(sql, maxAgeHours);
  } catch (err) {
    console.warn(
      "[db-health] ingest staleness check failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Cron-facing database evaluation. Both required probes must complete before
 * the database can be called available; otherwise the cron cannot distinguish
 * healthy data from checks that never ran.
 */
export async function evaluateDbHealth(
  maxAgeHours = INGEST_STALE_HOURS,
): Promise<DbHealthEvaluation> {
  let sql: RawSql | null;
  try {
    sql = getSql();
  } catch (err) {
    console.error(
      "[db-health] database client initialization failed:",
      err instanceof Error ? err.message : err,
    );
    return infrastructureUnavailable("query_failed");
  }

  if (!sql) return infrastructureUnavailable("not_configured");

  try {
    const [rlsTables, staleIngestAnomalies] = await Promise.all([
      queryRlsUnprotectedTables(sql),
      queryStaleIngestSources(sql, maxAgeHours),
    ]);
    return {
      status: "available",
      reason: null,
      anomalies: [
        ...rlsTables.map(
          (table): Anomaly => ({
            source: table,
            kind: "rls_unprotected",
            detail: `public.${table} has RLS DISABLED — the anon/PostgREST role can read/write it. Run "ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;" in the Supabase SQL editor.`,
          }),
        ),
        ...staleIngestAnomalies,
      ],
    };
  } catch (err) {
    console.error(
      "[db-health] required health query failed:",
      err instanceof Error ? err.message : err,
    );
    return infrastructureUnavailable("query_failed");
  }
}

export type IngestRunSummary = {
  source: string;
  status: string | null;
  startedAt: string | null;
  endedAt: string | null;
  recordsIn: number;
  recordsUpserted: number;
  recordsFailed: number;
  error: string | null;
  /** Last run older than 36h (the source's cron may have stopped firing).
   *  Computed here, not in the page, so the server component render stays pure. */
  stale: boolean;
};

const INGEST_STALE_MS = 36 * 3_600_000;

/**
 * obs-2 read side — the most recent `ingest_runs` row per source, so the admin
 * dashboard shows whether each cron-driven ingest succeeded, when, and how many
 * rows it wrote. The (source_slug, started_at) index backs the per-source
 * latest lookup. Fail-soft to [].
 */
export async function getRecentIngestRuns(): Promise<IngestRunSummary[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = (await sql`
      SELECT DISTINCT ON (source_slug)
             source_slug, status, started_at, ended_at,
             records_in, records_upserted, records_failed, error
      FROM ingest_runs
      ORDER BY source_slug, started_at DESC
    `) as unknown as Array<{
      source_slug: string;
      status: string | null;
      started_at: string | Date | null;
      ended_at: string | Date | null;
      records_in: number | null;
      records_upserted: number | null;
      records_failed: number | null;
      error: string | null;
    }>;
    const nowMs = Date.now();
    return rows.map((r) => {
      const startedMs = r.started_at ? new Date(r.started_at).getTime() : 0;
      return {
        source: r.source_slug,
        status: r.status,
        startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
        endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
        recordsIn: Number(r.records_in ?? 0),
        recordsUpserted: Number(r.records_upserted ?? 0),
        recordsFailed: Number(r.records_failed ?? 0),
        error: r.error,
        stale: !startedMs || nowMs - startedMs > INGEST_STALE_MS,
      };
    });
  } catch (err) {
    console.warn(
      "[db-health] ingest-runs summary failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export type UnparseableSummary = {
  source: string;
  count: number;
  sample: string | null;
};

/**
 * obs-3 — surface the `unparseable_locations` queue. The ingest pipeline logs
 * every location it could not geocode here (per drizzle/0001) but nothing ever
 * reads it, so geocode-quality failures accumulate invisibly. Returns a
 * per-source count + most-recent sample for the admin dashboard.
 */
export async function getUnparseableLocationSummary(
  limit = 12,
): Promise<UnparseableSummary[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = (await sql`
      SELECT source_domain,
             count(*)::int AS n,
             (array_agg(raw_location ORDER BY seen_at DESC))[1] AS sample
      FROM unparseable_locations
      GROUP BY source_domain
      ORDER BY count(*) DESC
      LIMIT ${limit}
    `) as unknown as Array<{ source_domain: string; n: number; sample: string | null }>;
    return rows.map((r) => ({
      source: r.source_domain,
      count: Number(r.n),
      sample: r.sample,
    }));
  } catch (err) {
    console.warn(
      "[db-health] unparseable summary failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
