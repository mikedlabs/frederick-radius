/**
 * Durable event-identity archive.
 *
 * This route is intentionally separate from /api/cron/warm-events. The warm
 * route protects visitor TTFB and runs every 15 minutes; this slower worker
 * reuses those hot cache products and spends its own database budget making
 * event URLs durable. A slow archive write can no longer make a successful
 * user-facing cache warm look red.
 *
 * The writes are idempotent, so a failed or manually retried invocation can
 * safely repeat a partially completed batch. Removal checks are much stricter:
 * they run only for publishers whose complete raw identity inventory succeeded
 * in this invocation. A filtered public board is never treated as proof that a
 * publisher removed an event.
 */
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronAuth } from "../../ingest/_auth";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import {
  getCachedLiveEvents,
  withLiveEventFetchSession,
} from "@/lib/integrations/ical-live";
import { syncEventArchiveBatch } from "@/lib/events/event-archive-batch";
import {
  finishIngestRunStrict,
  startIngestRunStrict,
  type IngestRunResult,
} from "@/lib/ingest/run-log";
import {
  createAbortDeadline,
  withDeadlineOutcome,
} from "@/lib/promise-deadline";
import { EVENT_ARCHIVE_RUN } from "@/lib/quality/data-health-phases";
import {
  EVENT_ARCHIVE_DB_DEADLINE_MS,
  EVENT_ARCHIVE_HEARTBEAT_BUDGET_MS,
  EVENT_ARCHIVE_SOURCE_BUDGET_MS,
  EVENT_ARCHIVE_WRITE_BUDGET_MS,
} from "./config";
import { classifyEvent } from "@/lib/events/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type UnifiedEvents = Awaited<ReturnType<typeof assembleUnifiedEvents>>;
type LiveEvents = Awaited<ReturnType<typeof getCachedLiveEvents>>;

type SourceRead = readonly [
  PromiseSettledResult<UnifiedEvents>,
  PromiseSettledResult<LiveEvents>,
];

type ArchiveFailure =
  | "source-read"
  | "unified-events"
  | "unified-partial"
  | "live-events"
  | "live-partial"
  | "live-empty"
  | "no-public-events"
  | "no-archivable-events"
  | "archive-write"
  | "archive-cleanup"
  | "archive-incomplete"
  | "archive-truncated";

function failureSummary(failures: readonly ArchiveFailure[]): string | null {
  return failures.length > 0
    ? `Archive checks failed: ${failures.join(", ")}.`
    : null;
}

async function runHeartbeat<T>(
  requestSignal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
) {
  // Abort the database query before the outer Promise deadline. The remaining
  // half-second lets postgres-js settle its CancelRequest so no late INSERT can
  // leave an orphan `running` heartbeat after the route has already replied.
  const deadline = createAbortDeadline(
    EVENT_ARCHIVE_HEARTBEAT_BUDGET_MS - 500,
    requestSignal,
  );
  try {
    return await withDeadlineOutcome(
      work(deadline.signal),
      EVENT_ARCHIVE_HEARTBEAT_BUDGET_MS,
    );
  } finally {
    deadline.dispose();
  }
}

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const startedAt = Date.now();
  const runStart = await runHeartbeat(
    request.signal,
    (signal) =>
      startIngestRunStrict(EVENT_ARCHIVE_RUN, { signal }),
  );
  const runId =
    runStart.status === "fulfilled" ? runStart.value : null;

  // Do not mutate the archive unless the invocation can be audited. This also
  // turns a missing database or ingest_runs migration into an honest 503.
  if (!runId) {
    Sentry.captureMessage("event-archive: heartbeat could not start", {
      level: "warning",
    });
    return NextResponse.json({
      ok: false,
      phase: "event-archive",
      status: "error",
      heartbeat_recorded: false,
      archive_attempted: false,
      failures: ["heartbeat-start"],
      timing_ms: {
        total: Date.now() - startedAt,
      },
    }, { status: 503 });
  }

  // warm-events normally filled both keys moments earlier. The shared session
  // still prevents two upstream waterfalls if a deployment or eviction makes
  // this worker encounter a cold cache.
  const sourceOutcome = await withDeadlineOutcome(
    withLiveEventFetchSession(() =>
      Promise.allSettled([
        assembleUnifiedEvents(new Date()),
        getCachedLiveEvents(90),
      ] as const),
    ),
    EVENT_ARCHIVE_SOURCE_BUDGET_MS,
  );
  const sourceRead: SourceRead | null =
    sourceOutcome.status === "fulfilled" ? sourceOutcome.value : null;
  const unified = sourceRead?.[0] ?? null;
  const live90 = sourceRead?.[1] ?? null;
  const failures = new Set<ArchiveFailure>();

  if (!sourceRead) failures.add("source-read");
  if (unified?.status === "rejected") failures.add("unified-events");
  if (live90?.status === "rejected") failures.add("live-events");

  const publicEvents =
    unified?.status === "fulfilled" ? unified.value.publicEvents : [];
  // Civic meetings and town reminders have first-party detail links on the
  // Events page even though they are intentionally excluded from public
  // discovery. Archive every route-bearing lane so a transient calendar
  // outage cannot break a link Radius itself rendered.
  const utilityEvents =
    unified?.status === "fulfilled"
      ? unified.value.unified.filter((event) => {
          const lane = classifyEvent(event);
          return lane === "civic_meeting" || lane === "town_reminder";
        })
      : [];
  // Cancelled and postponed rows are intentionally absent from public
  // discovery, but an event Radius previously published still needs its
  // durable record updated. The archive writer refuses to create a brand-new
  // canonical page from a lifecycle-only row.
  const lifecycleEvents =
    unified?.status === "fulfilled"
      ? unified.value.unified.filter(
          (event) =>
            event.status === "cancelled"
            || event.status === "postponed",
        )
      : [];
  const archiveEvents = [
    ...publicEvents,
    ...utilityEvents,
    ...lifecycleEvents,
  ];
  if (
    unified?.status === "fulfilled"
    && unified.value.sourceHealth.degraded
  ) {
    failures.add("unified-partial");
  }
  if (publicEvents.length === 0) failures.add("no-public-events");

  const successfulSources =
    live90?.status === "fulfilled"
      ? live90.value.sources_succeeded.filter(
          (source) => source !== "ticketmaster",
        )
      : [];
  if (live90?.status === "fulfilled") {
    if (live90.value.sources_failed.length > 0) {
      failures.add("live-partial");
    }
    if (
      live90.value.sources_succeeded.length === 0
      && live90.value.sources_failed.length === 0
    ) {
      failures.add("live-empty");
    }
  }
  const successfulSourceSet = new Set(successfulSources);
  const seenSourceIdentities =
    live90?.status === "fulfilled"
      ? live90.value.events
          .filter(
            (event) =>
              successfulSourceSet.has(event.source)
              && Boolean(event.id?.trim()),
          )
          .map((event) => ({
            source: event.source,
            source_uid: event.id,
          }))
      : undefined;

  const archiveOutcome =
    archiveEvents.length > 0
      ? await withDeadlineOutcome(
          syncEventArchiveBatch(archiveEvents, {
            deadlineMs: EVENT_ARCHIVE_DB_DEADLINE_MS,
            successfulSources,
            seenSourceIdentities,
          }),
          EVENT_ARCHIVE_WRITE_BUDGET_MS,
        )
      : null;
  const archive =
    archiveOutcome?.status === "fulfilled"
      ? archiveOutcome.value
      : null;

  if (archiveOutcome && archiveOutcome.status !== "fulfilled") {
    failures.add("archive-write");
  }
  if (archive) {
    const recordsComplete =
      archive.recordsComplete
      ?? (!archive.truncated
        && !archive.timedOut
        && archive.upserted + archive.ignoredLifecycleOnly
          === archive.accepted);
    if (archive.accepted === 0) failures.add("no-archivable-events");
    if (archive.failure?.stage === "tombstone") {
      failures.add("archive-cleanup");
    } else if (
      archive.failure?.stage === "upsert"
      || (archive.timedOut && !archive.failure)
    ) {
      failures.add("archive-write");
    }
    if (archive.truncated) failures.add("archive-truncated");
    if (
      !recordsComplete
      || archive.upserted + archive.ignoredLifecycleOnly
        !== archive.accepted
    ) {
      failures.add("archive-incomplete");
    }
  }

  const failureList = [...failures];
  const recordsUpserted = archive?.upserted ?? 0;
  const status: IngestRunResult["status"] =
    failureList.length === 0
      ? "ok"
      : recordsUpserted > 0
        ? "partial"
        : "error";
  const finish = await runHeartbeat(
    request.signal,
    (signal) =>
      finishIngestRunStrict(runId, {
        status,
        records_in: archiveEvents.length,
        records_upserted: recordsUpserted,
        records_failed: failureList.length,
        error: failureSummary(failureList),
      }, { signal }),
  );
  const heartbeatRecorded = finish.status === "fulfilled";
  const ok = status === "ok" && heartbeatRecorded;

  if (!ok) {
    Sentry.captureMessage("event-archive: durable sync did not complete", {
      level: "warning",
      extra: {
        status,
        failures: failureList,
        heartbeatRecorded,
        archive,
      },
    });
  }

  return NextResponse.json({
    ok,
    phase: "event-archive",
    status,
    heartbeat_recorded: heartbeatRecorded,
    archive_attempted: Boolean(archiveOutcome),
    failures: failureList,
    sources: {
      succeeded:
        live90?.status === "fulfilled"
          ? live90.value.sources_succeeded.length
          : 0,
      failed:
        live90?.status === "fulfilled"
          ? live90.value.sources_failed
          : [],
      tombstone_eligible: successfulSources.length,
    },
    archive: archive
      ? {
          accepted: archive.accepted,
          upserted: archive.upserted,
          ignored_lifecycle_only: archive.ignoredLifecycleOnly,
          records_complete:
            archive.recordsComplete
            ?? (!archive.truncated
              && !archive.timedOut
              && archive.upserted + archive.ignoredLifecycleOnly
                === archive.accepted),
          tombstoned: archive.tombstoned,
          batches: archive.batches,
          complete: archive.complete,
          truncated: archive.truncated,
          timed_out: archive.timedOut,
          tombstones_enabled: archive.tombstonesEnabled,
          failure: archive.failure ?? null,
        }
      : null,
    timing_ms: {
      total: Date.now() - startedAt,
      budgets: {
        source_read: EVENT_ARCHIVE_SOURCE_BUDGET_MS,
        archive_write: EVENT_ARCHIVE_WRITE_BUDGET_MS,
        database_deadline: EVENT_ARCHIVE_DB_DEADLINE_MS,
        heartbeat: EVENT_ARCHIVE_HEARTBEAT_BUDGET_MS,
      },
    },
  }, { status: ok ? 200 : 503 });
}
