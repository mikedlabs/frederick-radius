import { setMaxListeners } from "node:events";
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { recordSourceProbeResultsStrict } from "@/lib/ingest/run-log";
import {
  aggregateFeedHealthBySource,
  probeFeedEndpoints,
  runtimeSourceProbeGate,
} from "@/lib/quality/feed-health";
import { runtimeSourceProbeEndpoints } from "@/lib/quality/runtime-source-health";
import {
  createAbortDeadline,
  withDeadlineOutcome,
} from "@/lib/promise-deadline";
import { monitorCronResponse } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROBE_DEADLINE_MS = 45_000;
const PERSIST_DEADLINE_MS = 6_000;
const PROBE_CONCURRENCY = 8;

/**
 * Durable, low-cost health evidence for active request-time sources.
 *
 * Selection is registry-gated to `active/runtime`; pipeline and workflow URLs
 * can be checked by other tripwires but can never become publication evidence
 * through this route. Multi-endpoint sources produce one all-or-failed row.
 */
export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  return monitorCronResponse(
    "runtime-source-health",
    {
      schedule: "43 */2 * * *",
      checkinMarginMinutes: 10,
      maxRuntimeMinutes: 2,
    },
    () => runRuntimeSourceHealth(request),
  );
}

async function runRuntimeSourceHealth(request: Request) {
  const attemptedAt = new Date().toISOString();
  const endpoints = runtimeSourceProbeEndpoints();
  if (endpoints.length === 0) {
    return NextResponse.json(
      {
        phase: "runtime-source-health",
        status: "error",
        error: "No active runtime probes are configured.",
      },
      { status: 503 },
    );
  }

  const probeDeadline = createAbortDeadline(
    PROBE_DEADLINE_MS,
    request.signal,
  );
  // One route-wide signal fans out through a bounded worker pool. Raise only
  // this signal's listener ceiling; no global EventEmitter setting changes.
  setMaxListeners(0, probeDeadline.signal);
  const results = await probeFeedEndpoints(endpoints, {
    concurrency: PROBE_CONCURRENCY,
    signal: probeDeadline.signal,
  });
  probeDeadline.dispose();

  const aggregated = aggregateFeedHealthBySource(results);
  const persistable = aggregated.filter(
    (result): result is typeof result & {
      outcome: "success" | "failure";
    } => result.outcome !== "skipped",
  );
  const skipped = aggregated.filter(
    (result) => result.outcome === "skipped",
  );
  const failed = persistable.filter(
    (result) => result.outcome === "failure",
  );
  const readiness = runtimeSourceProbeGate(aggregated, results);

  const persistDeadline = createAbortDeadline(
    PERSIST_DEADLINE_MS,
    request.signal,
  );
  const persistence = await withDeadlineOutcome(
    recordSourceProbeResultsStrict(
      persistable.map((result) => ({
        sourceSlug: result.sourceId,
        outcome: result.outcome,
        error: result.error,
      })),
      attemptedAt,
      { signal: persistDeadline.signal },
    ),
    PERSIST_DEADLINE_MS + 500,
  );
  persistDeadline.dispose();

  const persisted =
    persistence.status === "fulfilled" ? persistence.value : 0;
  const persistenceComplete =
    persistence.status === "fulfilled" && persisted === persistable.length;
  const status = !persistenceComplete || readiness.blocking
    ? "error"
    : failed.length > 0 || skipped.length > 0
      ? "partial"
      : "ok";

  return NextResponse.json(
    {
      phase: "runtime-source-health",
      status,
      sources: {
        checked: aggregated.length,
        healthy: persistable.length - failed.length,
        failed: failed.map((result) => result.sourceId),
        skipped: skipped.map((result) => result.sourceId),
      },
      endpoints: {
        checked: results.length,
      },
      evidence: {
        expected: persistable.length,
        persisted,
      },
      readiness,
      timing: {
        probeDeadlineMs: PROBE_DEADLINE_MS,
        persistenceDeadlineMs: PERSIST_DEADLINE_MS,
      },
    },
    { status: persistenceComplete && !readiness.blocking ? 200 : 503 },
  );
}
