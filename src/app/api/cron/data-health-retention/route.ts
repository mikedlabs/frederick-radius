import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import {
  pruneOldSnapshots,
  SNAPSHOT_PRUNE_BATCH_SIZE,
} from "@/lib/integrations/feed-snapshot";
import {
  prunePushLog,
  PUSH_LOG_PRUNE_BATCH_SIZE,
} from "@/lib/push-fanout";
import {
  pruneNfcEvents,
  NFC_EVENT_PRUNE_BATCH_SIZE,
} from "@/lib/nfc-retention";
import {
  pruneExpiredReports,
  COMMUNITY_REPORT_PRUNE_BATCH_SIZE,
} from "@/lib/loaders/communityReports";
import {
  finishIngestRunStrict,
  startIngestRunStrict,
  type IngestRunResult,
} from "@/lib/ingest/run-log";
import { withDeadlineOutcome } from "@/lib/promise-deadline";
import { DATA_HEALTH_RETENTION_RUN } from "@/lib/quality/data-health-phases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 90;
const RUN_LOG_DEADLINE_MS = 5_000;
const RETENTION_WORK_BUDGET_MS = 42_000;
const RETENTION_STATEMENT_TIMEOUT_MS = 5_000;

type RetentionTaskName =
  | "feed_snapshots"
  | "push_log"
  | "nfc_events"
  | "community_reports";

type RetentionTaskOutcome =
  | { status: "fulfilled"; value: number }
  | { status: "rejected" }
  | { status: "not_started" };

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  // This scheduled route is deliberately inert until the operator confirms a
  // recent backup and enables the existing production flag. Adding the route
  // does not enable deletion.
  if (process.env.DATA_RETENTION_PRUNE !== "1") {
    return NextResponse.json({
      phase: "retention",
      enabled: false,
      deletion_attempted: false,
      note: "Set DATA_RETENTION_PRUNE=1 only after the production backup check.",
    });
  }

  const startedAt = Date.now();
  const runStart = await withDeadlineOutcome(
    startIngestRunStrict(DATA_HEALTH_RETENTION_RUN),
    RUN_LOG_DEADLINE_MS,
  );
  const runId =
    runStart.status === "fulfilled" ? runStart.value : null;
  const caps = {
    feed_snapshots: SNAPSHOT_PRUNE_BATCH_SIZE,
    push_log: PUSH_LOG_PRUNE_BATCH_SIZE,
    nfc_events: NFC_EVENT_PRUNE_BATCH_SIZE,
    community_reports: COMMUNITY_REPORT_PRUNE_BATCH_SIZE,
  };

  // Retention is auditable or it does not run. A database can be reachable
  // through one client while ingest-run logging is unavailable through
  // another, so do not attempt deletes unless the start heartbeat exists.
  if (!runId) {
    return NextResponse.json({
      phase: "retention",
      enabled: true,
      deletion_attempted: false,
      status: "error",
      heartbeat_recorded: false,
      retention_days: RETENTION_DAYS,
      work_budget_ms: RETENTION_WORK_BUDGET_MS,
      caps,
      results: {},
      timing_ms: { total: Date.now() - startedAt },
    }, { status: 503 });
  }

  // Each helper is oldest-first and row-capped. Run them sequentially because
  // production's max:1 Supabase pool serializes them anyway. Starting all four
  // at once left later DELETEs queued behind the first while their independent
  // timers expired; the route could then reply while queued destructive work
  // was still eligible to run. The shared budget prevents starting another
  // batch when there is not enough route headroom to record the final audit
  // heartbeat.
  const workDeadlineAt = startedAt + RETENTION_WORK_BUDGET_MS;
  const tasks: ReadonlyArray<{
    name: RetentionTaskName;
    maxStatements: number;
    run: () => Promise<number>;
  }> = [
    {
      name: "feed_snapshots",
      maxStatements: 1,
      run: () =>
        pruneOldSnapshots(
          RETENTION_DAYS,
          SNAPSHOT_PRUNE_BATCH_SIZE,
          RETENTION_STATEMENT_TIMEOUT_MS,
        ),
    },
    {
      name: "push_log",
      maxStatements: 1,
      run: () =>
        prunePushLog(
          RETENTION_DAYS,
          PUSH_LOG_PRUNE_BATCH_SIZE,
          RETENTION_STATEMENT_TIMEOUT_MS,
        ),
    },
    {
      name: "nfc_events",
      maxStatements: 1,
      run: () =>
        pruneNfcEvents(
          RETENTION_DAYS,
          NFC_EVENT_PRUNE_BATCH_SIZE,
          RETENTION_STATEMENT_TIMEOUT_MS,
        ),
    },
    {
      name: "community_reports",
      maxStatements: 2,
      run: () =>
        pruneExpiredReports(
          1,
          COMMUNITY_REPORT_PRUNE_BATCH_SIZE,
          RETENTION_STATEMENT_TIMEOUT_MS,
        ),
    },
  ];
  const taskResults = {} as Record<
    RetentionTaskName,
    RetentionTaskOutcome
  >;
  let attemptedTasks = 0;
  for (const task of tasks) {
    const requiredHeadroom =
      task.maxStatements * RETENTION_STATEMENT_TIMEOUT_MS;
    if (workDeadlineAt - Date.now() < requiredHeadroom) {
      taskResults[task.name] = { status: "not_started" };
      continue;
    }
    attemptedTasks += 1;
    try {
      taskResults[task.name] = {
        status: "fulfilled",
        value: await task.run(),
      };
    } catch {
      taskResults[task.name] = { status: "rejected" };
    }
  }
  const failedTasks = Object.entries(taskResults)
    .filter(([, outcome]) => outcome.status !== "fulfilled")
    .map(([name]) => name);
  const deletedRows = Object.values(taskResults).reduce(
    (sum, outcome) =>
      sum + (outcome.status === "fulfilled" ? outcome.value : 0),
    0,
  );
  const status: IngestRunResult["status"] =
    failedTasks.length === 0 ? "ok" : "error";

  const finish = await withDeadlineOutcome(
    finishIngestRunStrict(runId, {
      status,
      records_in: 4,
      records_upserted: deletedRows,
      records_failed: failedTasks.length,
      error:
        status === "ok"
          ? null
          : `Retention tasks failed: ${failedTasks.join(", ")}.`,
    }),
    RUN_LOG_DEADLINE_MS,
  );
  const heartbeatRecorded =
    Boolean(runId) && finish.status === "fulfilled";
  const responseStatus =
    status === "ok" && heartbeatRecorded ? 200 : 503;

  return NextResponse.json({
    phase: "retention",
    enabled: true,
    deletion_attempted: attemptedTasks > 0,
    tasks_attempted: attemptedTasks,
    status,
    heartbeat_recorded: heartbeatRecorded,
    retention_days: RETENTION_DAYS,
    work_budget_ms: RETENTION_WORK_BUDGET_MS,
    statement_timeout_ms: RETENTION_STATEMENT_TIMEOUT_MS,
    caps,
    results: Object.fromEntries(
      Object.entries(taskResults).map(([name, outcome]) => [
        name,
        outcome.status === "fulfilled"
          ? { status: "ok", deleted: outcome.value }
          : { status: outcome.status },
      ]),
    ),
    timing_ms: { total: Date.now() - startedAt },
  }, { status: responseStatus });
}
