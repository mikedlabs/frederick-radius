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

async function insertIngestRun(sourceSlug: string): Promise<string | null> {
  const sql = getSql();
  if (!sql) return null;
  const rows = (await sql`
    INSERT INTO ingest_runs (source_slug, started_at, status)
    VALUES (${sourceSlug}, now(), 'running')
    RETURNING id
  `) as unknown as Array<{ id: string }>;
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
export function startIngestRunStrict(sourceSlug: string): Promise<string | null> {
  return insertIngestRun(sourceSlug);
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
): Promise<void> {
  if (!runId) return;
  const sql = getSql();
  if (!sql) return;
  await sql`
    UPDATE ingest_runs
    SET ended_at = now(),
        status = ${result.status},
        records_in = ${result.records_in ?? 0},
        records_upserted = ${result.records_upserted ?? 0},
        records_failed = ${result.records_failed ?? 0},
        error = ${result.error ?? null}
    WHERE id = ${runId}
  `;
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
): Promise<void> {
  return updateIngestRun(runId, result);
}
