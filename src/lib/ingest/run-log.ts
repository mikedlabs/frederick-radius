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

/** Insert a `running` row; returns its id (or null when no DB / on error). */
export async function startIngestRun(sourceSlug: string): Promise<string | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = (await sql`
      INSERT INTO ingest_runs (source_slug, started_at, status)
      VALUES (${sourceSlug}, now(), 'running')
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

export type IngestRunResult = {
  status: "ok" | "partial" | "error";
  records_in?: number;
  records_upserted?: number;
  records_failed?: number;
  error?: string | null;
};

/** Stamp a run's completion (status + counts + error). No-op without a runId. */
export async function finishIngestRun(
  runId: string | null,
  result: IngestRunResult,
): Promise<void> {
  if (!runId) return;
  const sql = getSql();
  if (!sql) return;
  try {
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
  } catch {
    /* telemetry only — never surface to the ingest */
  }
}
