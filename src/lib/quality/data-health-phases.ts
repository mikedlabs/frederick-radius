import type { Anomaly } from "@/lib/integrations/feed-snapshot";

export const DATA_HEALTH_FEEDS_RUN = "data-health:feeds";
export const DATA_HEALTH_RETENTION_RUN = "data-health:retention";
export const EVENT_ARCHIVE_RUN = "event-archive";
export const DATA_HEALTH_PHASE_MAX_AGE_MS = 2 * 60 * 60_000;
const PHASE_DIAGNOSTIC_MAX_CHARS = 240;

const FEED_DIAGNOSTIC =
  /^(?:(?:Phase checks failed|Live sources failed): [a-z0-9_-]+(?:, [a-z0-9_-]+)*\.(?: )?)+$/;
const RETENTION_DIAGNOSTIC =
  /^Retention tasks failed: (?:feed_snapshots|push_log|nfc_events|community_reports)(?:, (?:feed_snapshots|push_log|nfc_events|community_reports))*\.$/;
const EVENT_ARCHIVE_DIAGNOSTIC =
  /^Archive checks failed: (?:source-read|unified-events|unified-partial|live-events|live-partial|live-empty|no-public-events|no-archivable-events|archive-write|archive-cleanup|archive-incomplete|archive-truncated)(?:, (?:source-read|unified-events|unified-partial|live-events|live-partial|live-empty|no-public-events|no-archivable-events|archive-write|archive-cleanup|archive-incomplete|archive-truncated))*\.$/;

/**
 * Worker error columns can eventually contain arbitrary provider or database
 * failures, so they must not be copied into alerts by default. These phase
 * workers deliberately write a small controlled vocabulary. Preserve only
 * those known summaries, then cap the result before it reaches Slack/GitHub.
 */
function controlledPhaseDiagnostic(
  source: string,
  error: string | null,
): string | null {
  if (!error) return null;
  const allowed =
    source === DATA_HEALTH_FEEDS_RUN
      ? FEED_DIAGNOSTIC.test(error)
      : source === DATA_HEALTH_RETENTION_RUN
        ? RETENTION_DIAGNOSTIC.test(error)
        : source === EVENT_ARCHIVE_RUN
          ? EVENT_ARCHIVE_DIAGNOSTIC.test(error)
          : false;
  if (!allowed) return null;
  return error.length <= PHASE_DIAGNOSTIC_MAX_CHARS
    ? error
    : `${error.slice(0, PHASE_DIAGNOSTIC_MAX_CHARS - 1)}…`;
}

export type DataHealthPhaseRun = {
  source: string;
  status: string | null;
  startedAt: string | null;
  endedAt: string | null;
  recordsIn: number;
  recordsUpserted: number;
  recordsFailed: number;
  error: string | null;
};

export type DataHealthPhaseState = {
  source: string;
  green: boolean;
  run: DataHealthPhaseRun | null;
  anomaly: Anomaly | null;
};

/**
 * The final data-health reporter runs shortly after its worker phases. A phase
 * is green only when it completed successfully inside that reporting window.
 * Missing, stale, still-running, partial, or failed heartbeats are all red.
 */
export function evaluateDataHealthPhase(
  source: string,
  runs: readonly DataHealthPhaseRun[],
  now = new Date(),
  maxAgeMs = DATA_HEALTH_PHASE_MAX_AGE_MS,
): DataHealthPhaseState {
  const run = runs.find((candidate) => candidate.source === source) ?? null;
  const startedMs = run?.startedAt ? Date.parse(run.startedAt) : Number.NaN;
  const ageMs = Number.isFinite(startedMs)
    ? now.getTime() - startedMs
    : Number.POSITIVE_INFINITY;
  const current =
    ageMs >= 0
    && ageMs <= maxAgeMs;
  const complete =
    run?.status === "ok"
    && Boolean(run.endedAt)
    && run.recordsFailed === 0;

  if (run && current && complete) {
    return { source, green: true, run, anomaly: null };
  }

  let reason: string;
  if (!run) {
    reason = "No heartbeat was recorded.";
  } else if (!current) {
    reason = "The latest heartbeat is missing a valid start time or is outside the reporting window.";
  } else if (!run.endedAt || run.status === "running") {
    reason = "The latest run did not record a completion.";
  } else if (run.recordsFailed > 0) {
    const diagnostic = controlledPhaseDiagnostic(source, run.error);
    reason = `${run.recordsFailed} operation${run.recordsFailed === 1 ? "" : "s"} failed.${
      diagnostic ? ` Worker report: ${diagnostic}` : ""
    }`;
  } else {
    reason = `The latest run ended with status ${run.status ?? "unknown"}.`;
  }

  return {
    source,
    green: false,
    run,
    anomaly: {
      source,
      kind: "tripwire_failed",
      detail: `${reason} The final data-health report cannot call this phase healthy.`,
    },
  };
}
