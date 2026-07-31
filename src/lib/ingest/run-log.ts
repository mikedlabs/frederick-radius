/**
 * obs-2 — ingest-run telemetry. The cron-driven ingest routes (fcpl, fcvfra)
 * populate the corpus behind /today + /events but, unlike the Drizzle-based
 * ical.ts path, never wrote a row to `ingest_runs` — so a silent partial
 * failure (feed half-fetched, geocoder down) was invisible until counts
 * visibly dropped. These helpers record a run start + completion via the raw
 * postgres-js handle (matching those routes' raw-SQL style; ingest_runs is a
 * pipeline table, fine to touch directly).
 *
 * FAIL-SOFT: every call no-ops without a DB and swallows its own errors —
 * telemetry must never affect the ingest itself or its HTTP response.
 */
import "server-only";
import { getSql } from "@/lib/db/client";

type CancelableQuery<T> = Promise<T> & {
  cancel: () => void;
};

type StrictRunLogOptions = {
  signal?: AbortSignal;
};

/**
 * postgres-js exposes an actual query cancel operation. Wire strict cron
 * heartbeats to the route's AbortSignal so a Promise deadline cannot return
 * while a queued INSERT later creates an orphan `running` row.
 */
async function waitForRunLogQuery<T>(
  query: CancelableQuery<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return query;
  const cancel = () => query.cancel();
  if (signal.aborted) {
    cancel();
    return query;
  }
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await query;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

async function insertIngestRun(
  sourceSlug: string,
  options: StrictRunLogOptions = {},
): Promise<string | null> {
  const sql = getSql();
  if (!sql) return null;
  const query = sql`
      INSERT INTO ingest_runs (source_slug, started_at, status)
      VALUES (${sourceSlug}, now(), 'running')
      RETURNING id
    ` as unknown as CancelableQuery<Array<{ id: string }>>;
  const rows = await waitForRunLogQuery(query, options.signal);
  return rows[0]?.id ?? null;
}

/** Insert a `running` row; returns its id (or null when no DB / on error). */
export async function startIngestRun(sourceSlug: string): Promise<string | null> {
  try {
    return await insertIngestRun(sourceSlug);
  } catch {
    return null;
  }
}

/** Phase-worker variant: database errors reject instead of looking like a
 * successful telemetry no-op. */
export function startIngestRunStrict(
  sourceSlug: string,
  options: StrictRunLogOptions = {},
): Promise<string | null> {
  return insertIngestRun(sourceSlug, options);
}

export type IngestRunResult = {
  status: "ok" | "partial" | "error";
  records_in?: number;
  records_upserted?: number;
  records_failed?: number;
  error?: string | null;
};

/** Stamp a run's completion (status + counts + error). No-op without a runId. */
async function updateIngestRun(
  runId: string | null,
  result: IngestRunResult,
  options: StrictRunLogOptions = {},
): Promise<void> {
  if (!runId) return;
  const sql = getSql();
  if (!sql) return;
  const query = sql`
      UPDATE ingest_runs
      SET ended_at = now(),
          status = ${result.status},
          records_in = ${result.records_in ?? 0},
          records_upserted = ${result.records_upserted ?? 0},
          records_failed = ${result.records_failed ?? 0},
          error = ${result.error ?? null}
      WHERE id = ${runId}
    ` as unknown as CancelableQuery<unknown>;
  await waitForRunLogQuery(query, options.signal);
}

export async function finishIngestRun(
  runId: string | null,
  result: IngestRunResult,
): Promise<void> {
  try {
    await updateIngestRun(runId, result);
  } catch {
    /* telemetry only — never surface to the ingest */
  }
}

/** Phase-worker variant: a failed completion write must reject so the route
 * cannot claim that its heartbeat was safely recorded. */
export function finishIngestRunStrict(
  runId: string | null,
  result: IngestRunResult,
  options: StrictRunLogOptions = {},
): Promise<void> {
  return updateIngestRun(runId, result, options);
}

/**
 * Persist one completed failure row per named runtime source.
 *
 * Successful event probes already publish a durable `feed_snapshots` row. A
 * failed source has no snapshot to write, so without this batch the public
 * ledger can only see its older success and misclassifies the outage as
 * generic staleness. One INSERT keeps the failure evidence bounded and avoids
 * turning a broad outage into dozens of sequential database round trips.
 */
export async function recordSourceProbeFailuresStrict(
  sourceSlugs: readonly string[],
  attemptedAt: string,
): Promise<number> {
  const unique = [...new Set(
    sourceSlugs.map((source) => source.trim()).filter(Boolean),
  )];
  if (unique.length === 0) return 0;
  if (!Number.isFinite(Date.parse(attemptedAt))) {
    throw new Error("Source probe failure evidence needs a valid timestamp.");
  }
  const sql = getSql();
  if (!sql) return 0;
  await sql`
    INSERT INTO ingest_runs (
      source_slug,
      started_at,
      ended_at,
      status,
      records_in,
      records_upserted,
      records_failed,
      error
    )
    SELECT failed.source_slug,
           ${attemptedAt}::timestamptz,
           now(),
           'error',
           0,
           0,
           1,
           'The fresh runtime feed check failed.'
    FROM unnest(${unique}::text[]) AS failed(source_slug)
  `;
  return unique.length;
}
