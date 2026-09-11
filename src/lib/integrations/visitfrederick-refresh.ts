import "server-only";

import {
  fetchVisitFrederickNativeFeed,
  factualVisitFrederickEvents,
  normalizeVisitFrederickRss,
  visitFrederickFeedPayloadIsValid,
  type VisitFrederickNativeFeedResult,
} from "@/lib/integrations/visitfrederick";
import {
  readVisitFrederickSnapshotState,
  VISIT_FREDERICK_FEED_URL,
  VISIT_FREDERICK_MIN_ATTEMPT_INTERVAL_MS,
  visitFrederickFactsReuseApproved,
  writeVisitFrederickSnapshot,
  type VisitFrederickSnapshot,
  type VisitFrederickSnapshotWriteResult,
} from "@/lib/integrations/visitfrederick-snapshot";
import {
  reserveDailyUsage,
  reserveUsageIntervalLease,
  type UsageIntervalLease,
  type UsageReservation,
} from "@/lib/usage-meter";
import {
  fetchFirecrawlPage,
  type FirecrawlPageSnapshot,
  type FirecrawlRestOptions,
} from "../../../scripts/lib/firecrawl-rest";

const FIRECRAWL_LOCAL_TIMEOUT_MS = 4_500;
const FIRECRAWL_PROVIDER_TIMEOUT_MS = 3_500;
const FIRECRAWL_MAX_RESPONSE_BYTES = 1_280 * 1_024;
const FIRECRAWL_DAILY_LIMIT = 12;

type FirecrawlFetch = (
  url: string,
  options: FirecrawlRestOptions,
) => Promise<FirecrawlPageSnapshot>;

export type VisitFrederickRefreshDependencies = {
  now?: () => Date;
  readSnapshot?: typeof readVisitFrederickSnapshotState;
  writeSnapshot?: typeof writeVisitFrederickSnapshot;
  fetchNative?: () => Promise<VisitFrederickNativeFeedResult>;
  fetchFirecrawl?: FirecrawlFetch;
  reserveInterval?: (
    namespace: "visit_frederick_refresh",
    intervalMs: number,
  ) => Promise<UsageIntervalLease | null>;
  reserveUsage?: (
    upstream: "firecrawl_visit_frederick",
    limit: number,
  ) => Promise<UsageReservation | null>;
  firecrawlEnabled?: boolean;
  firecrawlKeyPresent?: boolean;
  reuseApproved?: boolean;
};

export type VisitFrederickRefreshResult = {
  ok: boolean;
  skipped: boolean;
  updated: boolean;
  via: "native" | "firecrawl" | null;
  events: number;
  status: VisitFrederickSnapshot["lastAttemptStatus"];
  reason: string | null;
  budget: {
    limit: number;
    reserved: boolean;
    count: number | null;
  };
  storage: VisitFrederickSnapshotWriteResult | null;
};

function preserveWithStatus(
  previous: VisitFrederickSnapshot | null,
  attemptedAt: string,
  status: VisitFrederickSnapshot["lastAttemptStatus"],
): VisitFrederickSnapshot {
  return {
    version: 1,
    sourceUrl: VISIT_FREDERICK_FEED_URL,
    lastAttemptAt: attemptedAt,
    sourceFetchedAt: previous?.sourceFetchedAt ?? null,
    lastAttemptStatus: status,
    events: previous?.events ?? [],
  };
}

function successfulSnapshot(
  previous: VisitFrederickSnapshot | null,
  events: VisitFrederickSnapshot["events"],
  attemptedAt: string,
  sourceFetchedAt: string,
  via: "native" | "firecrawl",
): VisitFrederickSnapshot {
  // An empty publisher feed is much more likely to be a supply or parser
  // failure than proof that every listing disappeared. Never bless an empty
  // first run; preserve prior facts when available and mark the source
  // degraded so the next scheduled probe can recover.
  if (events.length === 0) {
    return preserveWithStatus(previous, attemptedAt, "failed");
  }
  if (
    previous &&
    previous.events.length >= 10 &&
    events.length <
      Math.max(3, Math.floor(previous.events.length * 0.35))
  ) {
    return preserveWithStatus(previous, attemptedAt, "failed");
  }
  return {
    version: 1,
    sourceUrl: VISIT_FREDERICK_FEED_URL,
    lastAttemptAt: attemptedAt,
    sourceFetchedAt,
    lastAttemptStatus: via === "native" ? "ok-native" : "ok-firecrawl",
    events,
  };
}

function rejectedCandidateReason(
  previous: VisitFrederickSnapshot | null,
  eventCount: number,
  recovered: boolean,
): string {
  const label = recovered ? "recovered" : "valid";
  if (eventCount === 0) {
    return `The ${label} feed was unexpectedly empty; the prior snapshot was kept.`;
  }
  return `The ${label} feed count dropped sharply from ${previous?.events.length ?? 0} to ${eventCount}; the prior snapshot was kept for review.`;
}

function firecrawlPayloadIsValid(
  snapshot: FirecrawlPageSnapshot,
): boolean {
  const statusCode = Number(snapshot.metadata.statusCode);
  const contentType =
    typeof snapshot.metadata.contentType === "string"
      ? snapshot.metadata.contentType
      : null;
  return (
    Number.isInteger(statusCode) &&
    statusCode >= 200 &&
    statusCode < 300 &&
    typeof snapshot.rawHtml === "string" &&
    visitFrederickFeedPayloadIsValid(
      snapshot.rawHtml,
      contentType,
      snapshot.finalUrl,
    )
  );
}

async function storeFailure(
  writeSnapshot: typeof writeVisitFrederickSnapshot,
  previous: VisitFrederickSnapshot | null,
  previousEtag: string | null,
  attemptedAt: string,
  status: VisitFrederickSnapshot["lastAttemptStatus"],
  reason: string,
  budget: VisitFrederickRefreshResult["budget"],
): Promise<VisitFrederickRefreshResult> {
  const storage = await writeSnapshot(
    preserveWithStatus(previous, attemptedAt, status),
    previousEtag ? { ifMatch: previousEtag } : {},
  );
  return {
    ok: false,
    skipped: false,
    updated: storage.stored,
    via: null,
    events: previous?.events.length ?? 0,
    status,
    reason,
    budget,
    storage,
  };
}

/**
 * Refresh Visit Frederick outside every visitor request.
 *
 * The order is deliberate: native first; one database-reserved paid recovery
 * only for a safe transient/invalid-same-origin failure; durable write last.
 * A storage or budget failure stops before Firecrawl, so cost control fails
 * closed.
 */
export async function refreshVisitFrederickSnapshot(
  dependencies: VisitFrederickRefreshDependencies = {},
): Promise<VisitFrederickRefreshResult> {
  const now = dependencies.now ?? (() => new Date());
  const readSnapshot =
    dependencies.readSnapshot ?? readVisitFrederickSnapshotState;
  const writeSnapshot =
    dependencies.writeSnapshot ?? writeVisitFrederickSnapshot;
  const fetchNative =
    dependencies.fetchNative ?? fetchVisitFrederickNativeFeed;
  const fetchFirecrawl =
    dependencies.fetchFirecrawl ?? fetchFirecrawlPage;
  const reserveUsage =
    dependencies.reserveUsage ?? reserveDailyUsage;
  const reserveInterval =
    dependencies.reserveInterval ?? reserveUsageIntervalLease;
  const firecrawlEnabled =
    dependencies.firecrawlEnabled ??
    process.env.FIRECRAWL_FETCH_FALLBACK === "1";
  const firecrawlKeyPresent =
    dependencies.firecrawlKeyPresent ??
    Boolean(process.env.FIRECRAWL_API_KEY);
  const reuseApproved =
    dependencies.reuseApproved ??
    visitFrederickFactsReuseApproved();

  if (!reuseApproved) {
    return {
      ok: true,
      skipped: true,
      updated: false,
      via: null,
      events: 0,
      status: "failed",
      reason:
        "Visit Frederick factual reuse is awaiting documented written permission.",
      budget: {
        limit: FIRECRAWL_DAILY_LIMIT,
        reserved: false,
        count: null,
      },
      storage: null,
    };
  }

  const attemptDate = now();
  const attemptedAt = attemptDate.toISOString();
  const snapshotState = await readSnapshot({
    cacheMode: "origin-fresh",
  });
  if (snapshotState.state === "unavailable") {
    return {
      ok: false,
      skipped: false,
      updated: false,
      via: null,
      events: 0,
      status: "failed",
      reason: snapshotState.reason,
      budget: {
        limit: FIRECRAWL_DAILY_LIMIT,
        reserved: false,
        count: null,
      },
      storage: null,
    };
  }
  const previous =
    snapshotState.state === "ok" ? snapshotState.snapshot : null;
  const previousEtag =
    snapshotState.state === "ok" ? snapshotState.etag : null;
  if (
    previous &&
    attemptDate.getTime() - Date.parse(previous.lastAttemptAt) <
      VISIT_FREDERICK_MIN_ATTEMPT_INTERVAL_MS
  ) {
    return {
      ok:
        previous.lastAttemptStatus === "ok-native" ||
        previous.lastAttemptStatus === "ok-firecrawl",
      skipped: true,
      updated: false,
      via:
        previous.lastAttemptStatus === "ok-native"
          ? "native"
          : previous.lastAttemptStatus === "ok-firecrawl"
            ? "firecrawl"
            : null,
      events: previous.events.length,
      status: previous.lastAttemptStatus,
      reason: "A recent refresh attempt already owns this interval.",
      budget: {
        limit: FIRECRAWL_DAILY_LIMIT,
        reserved: false,
        count: null,
      },
      storage: null,
    };
  }

  const intervalLease = await reserveInterval(
    "visit_frederick_refresh",
    VISIT_FREDERICK_MIN_ATTEMPT_INTERVAL_MS,
  );
  if (!intervalLease) {
    return {
      ok: false,
      skipped: false,
      updated: false,
      via: null,
      events: previous?.events.length ?? 0,
      status: previous?.lastAttemptStatus ?? "failed",
      reason: "The refresh interval lease could not be reserved.",
      budget: {
        limit: FIRECRAWL_DAILY_LIMIT,
        reserved: false,
        count: null,
      },
      storage: null,
    };
  }
  if (!intervalLease.acquired) {
    return {
      ok:
        previous?.lastAttemptStatus === "ok-native" ||
        previous?.lastAttemptStatus === "ok-firecrawl",
      skipped: true,
      updated: false,
      via: null,
      events: previous?.events.length ?? 0,
      status: previous?.lastAttemptStatus ?? "failed",
      reason: "Another refresh already owns this interval.",
      budget: {
        limit: FIRECRAWL_DAILY_LIMIT,
        reserved: false,
        count: null,
      },
      storage: null,
    };
  }

  const native = await fetchNative();
  if (native.state === "ok") {
    const sourceFetchedAt = now().toISOString();
    const events = factualVisitFrederickEvents(
      normalizeVisitFrederickRss(
        native.xml,
        new Date(sourceFetchedAt),
      ),
    );
    const next = successfulSnapshot(
      previous,
      events,
      attemptedAt,
      sourceFetchedAt,
      "native",
    );
    const storage = await writeSnapshot(
      next,
      previousEtag ? { ifMatch: previousEtag } : {},
    );
    const accepted = next.lastAttemptStatus === "ok-native";
    return {
      ok: accepted && storage.stored,
      skipped: false,
      updated: storage.stored,
      via: accepted ? "native" : null,
      events: next.events.length,
      status: next.lastAttemptStatus,
      reason: accepted
        ? storage.stored
          ? null
          : storage.reason ?? "The snapshot could not be stored."
        : rejectedCandidateReason(previous, events.length, false),
      budget: {
        limit: FIRECRAWL_DAILY_LIMIT,
        reserved: false,
        count: null,
      },
      storage,
    };
  }

  const emptyBudget = {
    limit: FIRECRAWL_DAILY_LIMIT,
    reserved: false,
    count: null,
  };
  if (native.state === "not-found") {
    if (
      previous?.lastAttemptStatus === "not-found" &&
      previous.events.length > 0
    ) {
      const confirmedGone: VisitFrederickSnapshot = {
        version: 1,
        sourceUrl: VISIT_FREDERICK_FEED_URL,
        lastAttemptAt: attemptedAt,
        sourceFetchedAt: null,
        lastAttemptStatus: "not-found",
        events: [],
      };
      const storage = await writeSnapshot(confirmedGone, {
        ifMatch: previousEtag ?? undefined,
      });
      return {
        ok: false,
        skipped: false,
        updated: storage.stored,
        via: null,
        events: storage.stored ? 0 : previous.events.length,
        status: "not-found",
        reason: storage.stored
          ? native.reason
          : storage.reason ?? "The confirmed removal could not be stored.",
        budget: emptyBudget,
        storage,
      };
    }
    return storeFailure(
      writeSnapshot,
      previous,
      previousEtag,
      attemptedAt,
      "not-found",
      native.reason,
      emptyBudget,
    );
  }
  if (native.state === "rejected") {
    return storeFailure(
      writeSnapshot,
      previous,
      previousEtag,
      attemptedAt,
      "failed",
      native.reason,
      emptyBudget,
    );
  }
  if (!firecrawlEnabled || !firecrawlKeyPresent) {
    return storeFailure(
      writeSnapshot,
      previous,
      previousEtag,
      attemptedAt,
      "failed",
      `${native.reason}; scheduled recovery is not configured`,
      emptyBudget,
    );
  }

  const reservation = await reserveUsage(
    "firecrawl_visit_frederick",
    FIRECRAWL_DAILY_LIMIT,
  );
  const budget = {
    limit: FIRECRAWL_DAILY_LIMIT,
    reserved: reservation?.reserved === true,
    count: reservation?.count ?? null,
  };
  if (!reservation?.reserved) {
    return storeFailure(
      writeSnapshot,
      previous,
      previousEtag,
      attemptedAt,
      "failed",
      reservation
        ? "The daily Firecrawl recovery limit has been reached."
        : "The Firecrawl budget could not be reserved.",
      budget,
    );
  }

  // Persist the reservation/failure state before spending. If Blob is down,
  // stop here; a paid attempt without durable state would defeat throttling.
  const reservationStorage = await writeSnapshot(
    preserveWithStatus(previous, attemptedAt, "failed"),
    previousEtag ? { ifMatch: previousEtag } : {},
  );
  if (!reservationStorage.stored || !reservationStorage.etag) {
    return {
      ok: false,
      skipped: false,
      updated: false,
      via: null,
      events: previous?.events.length ?? 0,
      status: "failed",
      reason:
        reservationStorage.reason ??
        "The recovery reservation could not be stored.",
      budget,
      storage: reservationStorage,
    };
  }

  let recovered: FirecrawlPageSnapshot;
  try {
    recovered = await fetchFirecrawl(VISIT_FREDERICK_FEED_URL, {
      outputFormat: "rawHtml",
      onlyMainContent: false,
      // A cached provider response cannot be re-stamped as newly observed.
      maxAgeMs: 0,
      storeInCache: false,
      timeoutMs: FIRECRAWL_LOCAL_TIMEOUT_MS,
      providerTimeoutMs: FIRECRAWL_PROVIDER_TIMEOUT_MS,
      proxy: "basic",
      requireReportedFinalUrl: true,
      maxResponseBytes: FIRECRAWL_MAX_RESPONSE_BYTES,
    });
  } catch {
    return {
      ok: false,
      skipped: false,
      updated: true,
      via: null,
      events: previous?.events.length ?? 0,
      status: "failed",
      reason: "The scheduled Firecrawl recovery failed.",
      budget,
      storage: reservationStorage,
    };
  }

  if (!firecrawlPayloadIsValid(recovered)) {
    return {
      ok: false,
      skipped: false,
      updated: true,
      via: null,
      events: previous?.events.length ?? 0,
      status: "failed",
      reason: "Firecrawl returned an invalid publisher snapshot.",
      budget,
      storage: reservationStorage,
    };
  }

  const sourceFetchedAt = now().toISOString();
  const events = factualVisitFrederickEvents(
    normalizeVisitFrederickRss(
      recovered.rawHtml ?? "",
      new Date(sourceFetchedAt),
    ),
  );
  const next = successfulSnapshot(
    previous,
    events,
    attemptedAt,
    sourceFetchedAt,
    "firecrawl",
  );
  const storage = await writeSnapshot(next, {
    ifMatch: reservationStorage.etag,
  });
  const accepted = next.lastAttemptStatus === "ok-firecrawl";
  return {
    ok: accepted && storage.stored,
    skipped: false,
    updated: storage.stored,
    via: accepted ? "firecrawl" : null,
    events: next.events.length,
    status: next.lastAttemptStatus,
    reason: accepted
      ? storage.stored
        ? null
        : storage.reason ?? "The snapshot could not be stored."
      : rejectedCandidateReason(previous, events.length, true),
    budget,
    storage,
  };
}

export {
  FIRECRAWL_DAILY_LIMIT as VISIT_FREDERICK_FIRECRAWL_DAILY_LIMIT,
};
