/**
 * Scanner archive cron — banks the live public incident feed into history.
 *
 * Every 15 minutes it appends any public incidents not yet stored (the live
 * feed keeps ~1h, so 15-min runs overlap and the unique dedupe_key drops the
 * repeats). No-op until the FredScanner feed is configured AND the
 * scanner_incidents table is migrated. Missing or incomplete persistence is a
 * failing cron result, while the public scanner reader still degrades safely.
 * Auth: the same CRON_SECRET bearer as the other crons.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { archiveScannerIncidents } from "@/lib/scanner/incidentArchive";
import {
  finishIngestRunStrict,
  startIngestRunStrict,
} from "@/lib/ingest/run-log";
import { monitorCronResponse } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  return monitorCronResponse(
    "scanner-archive",
    {
      schedule: "*/15 * * * *",
      checkinMarginMinutes: 5,
      maxRuntimeMinutes: 1,
    },
    runScannerArchive,
  );
}

async function runScannerArchive() {
  const runId = await startIngestRunStrict("scanner-archive").catch(() => null);

  const result = await archiveScannerIncidents().catch(() => ({
    seen: 0,
    inserted: 0,
    complete: false,
    reason: "archive_operation_failed" as const,
  }));
  const heartbeatRecorded = Boolean(runId) && await finishIngestRunStrict(
    runId,
    {
      status: result.complete ? "ok" : "error",
      records_in: result.seen,
      records_upserted: result.inserted,
      records_failed: result.complete ? 0 : 1,
      error: result.complete ? null : result.reason,
    },
  ).then(() => true).catch(() => false);
  const ok = result.complete && heartbeatRecorded;

  return NextResponse.json(
    {
      ok,
      ran_at: new Date().toISOString(),
      heartbeat_recorded: heartbeatRecorded,
      ...result,
    },
    { status: ok ? 200 : 503 },
  );
}
