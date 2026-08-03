import {
  getLiveEvents,
  type LiveEvent,
} from "@/lib/integrations/ical-live";
import {
  getFeedSnapshotStorageTelemetry,
  hydrateSnapshots,
  type FeedSnapshotStorageTelemetry,
} from "@/lib/integrations/feed-snapshot";
import { getDecisions as getDriftDecisions } from "@/lib/drift-review";
import {
  getRecentIngestRuns,
  getUnparseableLocationSummary,
  type IngestRunSummary,
  type UnparseableSummary,
} from "@/lib/quality/db-health";
import { getSourceHealthLedger } from "@/lib/quality/source-ledger.server";
import {
  buildRuntimeProbeEvidence,
  type SourceLedgerRow,
} from "@/lib/quality/source-ledger";
import {
  createAbortDeadline,
  withDeadlineOutcome,
} from "@/lib/promise-deadline";

export const DATA_HEALTH_HYDRATE_DEADLINE_MS = 1_500;
export const DATA_HEALTH_FEED_DEADLINE_MS = 6_000;
export const DATA_HEALTH_DB_DEADLINE_MS = 2_000;

type LiveCheck = {
  events: LiveEvent[];
  sources_succeeded: string[];
  sources_failed: string[];
};

type DataHealthPageDependencies = {
  hydrateSnapshots: typeof hydrateSnapshots;
  getLiveEvents: typeof getLiveEvents;
  getDriftDecisions: typeof getDriftDecisions;
  getUnparseableLocationSummary: typeof getUnparseableLocationSummary;
  getRecentIngestRuns: typeof getRecentIngestRuns;
  getFeedSnapshotStorageTelemetry: typeof getFeedSnapshotStorageTelemetry;
  getSourceHealthLedger: typeof getSourceHealthLedger;
};

const DEFAULT_DEPENDENCIES: DataHealthPageDependencies = {
  hydrateSnapshots,
  getLiveEvents,
  getDriftDecisions,
  getUnparseableLocationSummary,
  getRecentIngestRuns,
  getFeedSnapshotStorageTelemetry,
  getSourceHealthLedger,
};

async function boundedDataHealthRead<T>(
  label: string,
  promise: Promise<T>,
  deadlineMs: number,
  fallback: T,
): Promise<T> {
  const outcome = await withDeadlineOutcome(promise, deadlineMs);
  if (outcome.status === "fulfilled") return outcome.value;
  console.warn(
    `[data-health-page] ${label} ${outcome.status} after ${deadlineMs}ms`,
  );
  return fallback;
}

export type DataHealthPageRuntime = {
  liveCheck: LiveCheck | null;
  liveCheckedAt: string;
  driftDecisions: Awaited<ReturnType<typeof getDriftDecisions>>;
  unparseable: UnparseableSummary[];
  ingestRuns: IngestRunSummary[];
  sourceLedger: SourceLedgerRow[];
  snapshotStorage: FeedSnapshotStorageTelemetry | null;
};

/**
 * Load the operator board without making its HTML request a second health
 * cron. Every optional database read gets a small UI deadline, while the live
 * feed probe receives a real AbortSignal. Missing telemetry remains visibly
 * unavailable on the board instead of holding the request for 300 seconds.
 */
export async function loadDataHealthPageRuntime(
  dependencies: DataHealthPageDependencies = DEFAULT_DEPENDENCIES,
): Promise<DataHealthPageRuntime> {
  // Start independent database reads immediately. They can use the time spent
  // on snapshot hydration instead of extending the critical path afterward.
  const independentDatabaseReads = Promise.all([
    boundedDataHealthRead(
      "drift decisions",
      Promise.resolve().then(() => dependencies.getDriftDecisions()),
      DATA_HEALTH_DB_DEADLINE_MS,
      {},
    ),
    boundedDataHealthRead(
      "unparseable locations",
      Promise.resolve().then(() => dependencies.getUnparseableLocationSummary()),
      DATA_HEALTH_DB_DEADLINE_MS,
      [],
    ),
    boundedDataHealthRead(
      "recent ingest runs",
      Promise.resolve().then(() => dependencies.getRecentIngestRuns()),
      DATA_HEALTH_DB_DEADLINE_MS,
      [],
    ),
    boundedDataHealthRead(
      "snapshot storage",
      Promise.resolve().then(() => dependencies.getFeedSnapshotStorageTelemetry()),
      DATA_HEALTH_DB_DEADLINE_MS,
      null,
    ),
  ] as const);

  await boundedDataHealthRead(
    "snapshot hydration",
    Promise.resolve().then(() => dependencies.hydrateSnapshots()),
    DATA_HEALTH_HYDRATE_DEADLINE_MS,
    undefined,
  );

  const liveDeadline = createAbortDeadline(DATA_HEALTH_FEED_DEADLINE_MS);
  const liveCheckPromise = boundedDataHealthRead<LiveCheck | null>(
    "live event feeds",
    Promise.resolve().then(() =>
      dependencies.getLiveEvents(60, {
        signal: liveDeadline.signal,
      }),
    ),
    DATA_HEALTH_FEED_DEADLINE_MS,
    null,
  ).finally(liveDeadline.dispose);

  const [liveCheck, databaseReads] = await Promise.all([
    liveCheckPromise,
    independentDatabaseReads,
  ]);
  const [driftDecisions, unparseable, ingestRuns, snapshotStorage] =
    databaseReads;

  const liveCheckedAt = new Date().toISOString();
  const currentFeedEvidence = liveCheck
    ? buildRuntimeProbeEvidence(liveCheck, liveCheckedAt)
    : [];
  const sourceLedger = await boundedDataHealthRead(
    "source ledger",
    Promise.resolve().then(() =>
      dependencies.getSourceHealthLedger({ currentEvidence: currentFeedEvidence }),
    ),
    DATA_HEALTH_DB_DEADLINE_MS,
    [],
  );

  return {
    liveCheck,
    liveCheckedAt,
    driftDecisions,
    unparseable,
    ingestRuns,
    sourceLedger,
    snapshotStorage,
  };
}
