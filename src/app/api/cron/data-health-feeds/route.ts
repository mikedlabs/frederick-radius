import { NextResponse } from "next/server";
import { setMaxListeners } from "node:events";
import { verifyCronAuth } from "../../ingest/_auth";
import { getLiveEvents } from "@/lib/integrations/ical-live";
import {
  getAnomalies,
  hydrateSnapshotsStrict,
  persistCurrentSnapshotsStrict,
} from "@/lib/integrations/feed-snapshot";
import { consumeFeedMetrics } from "@/lib/integrations/event-schema";
import { liveSourceAnomalies } from "@/lib/quality/curated-freshness";
import {
  finishIngestRunStrict,
  recordSourceProbeFailuresStrict,
  startIngestRunStrict,
  type IngestRunResult,
} from "@/lib/ingest/run-log";
import {
  createAbortDeadline,
  withDeadlineOutcome,
} from "@/lib/promise-deadline";
import { DATA_HEALTH_FEEDS_RUN } from "@/lib/quality/data-health-phases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RUN_LOG_DEADLINE_MS = 5_000;
const HYDRATE_DEADLINE_MS = 8_000;
const LIVE_FEED_DEADLINE_MS = 15_000;
const LIVE_FEED_ABORT_SETTLE_MS = 1_000;
const SNAPSHOT_WRITE_DEADLINE_MS = 8_000;
const FAILURE_EVIDENCE_DEADLINE_MS = 5_000;

type LiveResult = Awaited<ReturnType<typeof getLiveEvents>>;

const FAILED_LIVE_RESULT: LiveResult = {
  events: [],
  sources_succeeded: [],
  sources_failed: ["live-feed-phase"],
};

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;
  const startedAt = Date.now();

  const runStart = await withDeadlineOutcome(
    startIngestRunStrict(DATA_HEALTH_FEEDS_RUN),
    RUN_LOG_DEADLINE_MS,
  );
  const runId =
    runStart.status === "fulfilled" ? runStart.value : null;

  const hydration = await withDeadlineOutcome(
    hydrateSnapshotsStrict(),
    HYDRATE_DEADLINE_MS,
  );
  const liveDeadline = createAbortDeadline(
    LIVE_FEED_DEADLINE_MS,
    request.signal,
  );
  // The request-local signal intentionally fans out to the whole registry.
  // Raise only this signal's listener ceiling so Node does not report a false
  // leak warning when more than ten providers compose their own deadlines.
  setMaxListeners(0, liveDeadline.signal);
  const liveOutcome = await withDeadlineOutcome(
    getLiveEvents(60, {
      includeTicketmaster: false,
      signal: liveDeadline.signal,
      readMode: "probe",
    }),
    LIVE_FEED_DEADLINE_MS + LIVE_FEED_ABORT_SETTLE_MS,
  );
  liveDeadline.dispose();
  const live =
    liveOutcome.status === "fulfilled"
      ? liveOutcome.value
      : FAILED_LIVE_RESULT;

  const snapshotWrite = await withDeadlineOutcome(
    persistCurrentSnapshotsStrict(live.sources_succeeded),
    SNAPSHOT_WRITE_DEADLINE_MS,
  );
  const persistedSnapshots =
    snapshotWrite.status === "fulfilled" ? snapshotWrite.value : 0;
  const expectedSnapshots = live.sources_succeeded.length;
  // A total worker timeout uses a synthetic phase key because it cannot
  // truthfully identify which upstream adapter failed. Named source failures
  // are durable ledger evidence; the synthetic phase failure stays on the
  // aggregate heartbeat only.
  const sourceFailures = live.sources_failed;
  const persistableSourceFailures = sourceFailures.filter(
    (source) => source !== "live-feed-phase",
  );
  const failureEvidenceWrite = await withDeadlineOutcome(
    recordSourceProbeFailuresStrict(
      persistableSourceFailures,
      new Date(startedAt).toISOString(),
    ),
    FAILURE_EVIDENCE_DEADLINE_MS,
  );
  const persistedSourceFailures =
    failureEvidenceWrite.status === "fulfilled"
      ? failureEvidenceWrite.value
      : 0;
  const reportedSourceCount =
    expectedSnapshots + live.sources_failed.length;
  const phaseFailures = [
    runStart.status !== "fulfilled" || !runId ? "heartbeat-start" : null,
    hydration.status !== "fulfilled" ? "snapshot-hydration" : null,
    liveOutcome.status !== "fulfilled" ? "live-feed-fetch" : null,
    reportedSourceCount === 0 ? "no-live-sources" : null,
    snapshotWrite.status !== "fulfilled"
    || persistedSnapshots !== expectedSnapshots
      ? "snapshot-persist"
      : null,
    failureEvidenceWrite.status !== "fulfilled"
    || persistedSourceFailures !== persistableSourceFailures.length
      ? "source-failure-evidence"
      : null,
  ].filter((value): value is string => Boolean(value));
  const status: IngestRunResult["status"] =
    phaseFailures.length > 0
      ? "error"
      : sourceFailures.length > 0
        ? "partial"
        : "ok";
  const recordsFailed = phaseFailures.length + sourceFailures.length;
  const summary =
    status === "ok"
      ? null
      : [
          phaseFailures.length > 0
            ? `Phase checks failed: ${phaseFailures.join(", ")}.`
            : null,
          sourceFailures.length > 0
            ? `Live sources failed: ${sourceFailures.join(", ")}.`
            : null,
        ].filter(Boolean).join(" ");

  const finish = await withDeadlineOutcome(
    finishIngestRunStrict(runId, {
      status,
      records_in: reportedSourceCount,
      records_upserted: persistedSnapshots,
      records_failed: recordsFailed,
      error: summary,
    }),
    RUN_LOG_DEADLINE_MS,
  );
  const heartbeatRecorded =
    Boolean(runId) && finish.status === "fulfilled";
  const responseStatus =
    status === "ok" && heartbeatRecorded ? 200 : 503;

  return NextResponse.json({
    phase: "feeds",
    status,
    heartbeat_recorded: heartbeatRecorded,
    sources: {
      succeeded: live.sources_succeeded.length,
      failed: sourceFailures,
    },
    snapshots: {
      expected: expectedSnapshots,
      persisted: persistedSnapshots,
    },
    source_failure_evidence: {
      expected: persistableSourceFailures.length,
      persisted: persistedSourceFailures,
    },
    anomalies: {
      feed: getAnomalies(),
      source_availability: liveSourceAnomalies(sourceFailures),
    },
    validation: consumeFeedMetrics(),
    timing_ms: {
      total: Date.now() - startedAt,
      hydrate_deadline: HYDRATE_DEADLINE_MS,
      live_feed_deadline: LIVE_FEED_DEADLINE_MS,
      snapshot_write_deadline: SNAPSHOT_WRITE_DEADLINE_MS,
      failure_evidence_deadline: FAILURE_EVIDENCE_DEADLINE_MS,
    },
  }, { status: responseStatus });
}
