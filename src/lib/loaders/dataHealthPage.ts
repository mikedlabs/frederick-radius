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

type BoundedRead<T> = { value: T; unavailable: boolean };

async function boundedDataHealthRead<T>(
  label: string,
  promise: Promise<T>,
  deadlineMs: number,
  fallback: T,
): Promise<BoundedRead<T>> {
  const outcome = await withDeadlineOutcome(promise, deadlineMs);
  if (outcome.status === "fulfilled") {
    return { value: outcome.value, unavailable: false };
  }
  console.warn(
    `[data-health-page] ${label} ${outcome.status} after ${deadlineMs}ms`,
  );
  // The caller now learns that this is a FALLBACK, not an answer. Returning a
  // bare [] here is what let the operator board print an all-clear over a
  // ledger it never managed to read.
  return { value: fallback, unavailable: true };
}

export type DataHealthPageRuntime = {
  liveCheck: LiveCheck | null;
  liveCheckedAt: string;
  driftDecisions: Awaited<ReturnType<typeof getDriftDecisions>>;
  unparseable: UnparseableSummary[];
  ingestRuns: IngestRunSummary[];
  sourceLedger: SourceLedgerRow[];
  snapshotStorage: FeedSnapshotStorageTelemetry | null;
  /** Reads that did NOT answer, by label. A board that cannot see its
   *  telemetry must say so rather than render the fallback as an all-clear. */
  unavailable: string[];
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
  const unavailable: string[] = [];
  const track = <T,>(label: string, read: BoundedRead<T>): T => {
    if (read.unavailable) unavailable.push(label);
    return read.value;
  };

  await boundedDataHealthRead(
    "snapshot hydration",
    Promise.resolve().then(() => dependencies.hydrateSnapshots()),
    DATA_HEALTH_HYDRATE_DEADLINE_MS,
    undefined,
  );

  // SEQUENTIALLY, one connection at a time.
  //
  // These four reads used to run under a single Promise.all, on the reasoning
  // that independent queries should overlap with snapshot hydration rather
  // than extend the critical path. That reasoning does not survive contact
  // with the connection pool: Supavisor runs this app at max: 1, so
  // concurrent getDb() callers do not overlap, they QUEUE. The first read
  // holds the only connection and the other three sit behind it until their
  // UI deadline fires, at which point each quietly returns its fallback.
  //
  // The board then rendered {} , [], [] and null as though the database had
  // answered and had nothing to report: an explicit all-clear over a ledger
  // it never actually read. The same Promise.all-over-getDb deadlock was
  // diagnosed and fixed once before in this repo (PR #1024); it came back
  // here wearing a deadline, which turned a hang into a silent lie.
  const driftDecisions = track(
    "drift decisions",
    await boundedDataHealthRead(
      "drift decisions",
      Promise.resolve().then(() => dependencies.getDriftDecisions()),
      DATA_HEALTH_DB_DEADLINE_MS,
      {},
    ),
  );
  const unparseable = track(
    "unparseable locations",
    await boundedDataHealthRead(
      "unparseable locations",
      Promise.resolve().then(() => dependencies.getUnparseableLocationSummary()),
      DATA_HEALTH_DB_DEADLINE_MS,
      [],
    ),
  );
  const ingestRuns = track(
    "recent ingest runs",
    await boundedDataHealthRead(
      "recent ingest runs",
      Promise.resolve().then(() => dependencies.getRecentIngestRuns()),
      DATA_HEALTH_DB_DEADLINE_MS,
      [],
    ),
  );
  const snapshotStorage = track(
    "snapshot storage",
    await boundedDataHealthRead(
      "snapshot storage",
      Promise.resolve().then(() => dependencies.getFeedSnapshotStorageTelemetry()),
      DATA_HEALTH_DB_DEADLINE_MS,
      null,
    ),
  );

  const liveDeadline = createAbortDeadline(DATA_HEALTH_FEED_DEADLINE_MS);
  // The live feed probe is HTTP, not the database, so it may still overlap
  // nothing and simply run on its own deadline.
  const liveCheck = track(
    "live event feeds",
    await boundedDataHealthRead<LiveCheck | null>(
      "live event feeds",
      Promise.resolve().then(() =>
        dependencies.getLiveEvents(60, {
          signal: liveDeadline.signal,
        }),
      ),
      DATA_HEALTH_FEED_DEADLINE_MS,
      null,
    ).finally(liveDeadline.dispose),
  );

  const liveCheckedAt = new Date().toISOString();
  const currentFeedEvidence = liveCheck
    ? buildRuntimeProbeEvidence(liveCheck, liveCheckedAt)
    : [];
  const sourceLedger = track(
    "source ledger",
    await boundedDataHealthRead(
      "source ledger",
      Promise.resolve().then(() =>
        dependencies.getSourceHealthLedger({ currentEvidence: currentFeedEvidence }),
      ),
      DATA_HEALTH_DB_DEADLINE_MS,
      [],
    ),
  );

  return {
    liveCheck,
    liveCheckedAt,
    driftDecisions,
    unparseable,
    ingestRuns,
    sourceLedger,
    snapshotStorage,
    unavailable,
  };
}
