/**
 * CivicEngage iCal ingester. Runs as a Vercel cron (daily 4am ET) — a
 * separate execution context from the user-facing app, which only ever
 * reads `ingested_events`. Per-source failure isolation: one bad feed
 * never blocks the others.
 *
 *   GET /api/ingest/civicengage           (cron, needs CRON_SECRET)
 *   GET /api/ingest/civicengage?dry=1     (auth required; parse+count only)
 *   GET /api/ingest/civicengage?only=Thurmont
 */
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import type { Sql } from "postgres";
import { getSql } from "@/lib/db/client";
import {
  parseICalResult,
  type ParsedEvent,
} from "@/lib/ingest/parser";
import { upsertEvent, emptyStats, type UpsertStats } from "@/lib/ingest/upsert";
import { startIngestRun, finishIngestRun } from "@/lib/ingest/run-log";
import { checkEventSchemaReadiness } from "@/lib/ingest/event-schema-readiness";
import { verifyCronAuth } from "../_auth";
import sources from "@/../config/civicengage_sources.json" with { type: "json" };

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Source = {
  municipality: string;
  domain: string;
  enabled: boolean;
  catids: number[];
  category_map: Record<string, string>;
  note?: string;
};

type RunStatus = "ok" | "partial" | "error";
type FetchStatus = "ok" | "partial" | "failed";
type ContentStatus =
  | "changed"
  | "unchanged"
  | "empty"
  | "not_checked"
  | "partial"
  | "error";

type SourceResult = {
  status: RunStatus;
  ok: boolean;
  events: number;
  duplicates: number;
  fetchStatus: FetchStatus;
  contentStatus: ContentStatus;
  feeds: {
    requested: number;
    fetched: number;
    failed: number;
  };
  records: {
    processed: number;
    failed: number;
  };
  stats?: UpsertStats;
  deadlineReached: boolean;
  error?: string;
};

type FeedResult =
  | {
      ok: true;
      catID: number;
      events: ParsedEvent[];
    }
  | {
      ok: false;
      catID: number;
      events: [];
      deadlineReached: boolean;
      error: string;
    };

type DedupedEvent = {
  event: ParsedEvent;
  category: string | null;
};

const UA = "FrederickRadius/1.0 (+https://frederickradius.app; civic event index)";
const ROUTE_BUDGET_MS = 240_000;
const FEED_TIMEOUT_MS = 20_000;
const SOURCE_CONCURRENCY = 3;
const FEED_CONCURRENCY_PER_SOURCE = 2;
const WRITE_START_BUFFER_MS = 1_000;
const AGGREGATE_RUN_SLUG = "civicengage:aggregate";

function feedUrl(domain: string, catID: number): string {
  return `https://${domain}/Common/Modules/iCalendar/iCalendar.aspx?catID=${catID}&feed=calendar`;
}

function sourceRunSlug(src: Source): string {
  return `civicengage:${src.domain}`;
}

function safeErrorCode(error: unknown): string | null {
  const candidate =
    typeof error === "object" && error !== null
      ? typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : typeof (error as { name?: unknown }).name === "string"
          ? (error as { name: string }).name
          : null
      : null;
  return candidate && /^[A-Za-z0-9_.-]{1,64}$/.test(candidate)
    ? candidate
    : null;
}

function remainingMs(deadlineAt: number): number {
  return deadlineAt - Date.now();
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => runWorker(),
    ),
  );
  return results;
}

function fetchStatus(requested: number, fetched: number): FetchStatus {
  if (requested === 0) return "failed";
  if (fetched === requested) return "ok";
  return fetched === 0 ? "failed" : "partial";
}

function sourceContentStatus({
  dry,
  fetched,
  uniqueEvents,
  processed,
  stats,
  processingError,
}: {
  dry: boolean;
  fetched: number;
  uniqueEvents: number;
  processed: number;
  stats: UpsertStats;
  processingError: boolean;
}): ContentStatus {
  if (fetched === 0) return "not_checked";
  if (uniqueEvents === 0) return "empty";
  if (dry) return "not_checked";
  if (processingError) return processed > 0 ? "partial" : "error";
  return stats.normUpserted > 0 ? "changed" : "unchanged";
}

async function fetchAndParseFeed(
  src: Source,
  catID: number,
  deadlineAt: number,
): Promise<FeedResult> {
  const remaining = remainingMs(deadlineAt);
  if (remaining <= 0) {
    return {
      ok: false,
      catID,
      events: [],
      deadlineReached: true,
      error: "route deadline reached before fetch",
    };
  }

  const timeoutMs = Math.min(FEED_TIMEOUT_MS, remaining);
  const deadlineLimited = timeoutMs < FEED_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(feedUrl(src.domain, catID), {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        catID,
        events: [],
        deadlineReached: false,
        error: `HTTP ${response.status}`,
      };
    }

    const parsed = parseICalResult(await response.text());
    if (!parsed.valid) {
      return {
        ok: false,
        catID,
        events: [],
        deadlineReached: false,
        error: parsed.error,
      };
    }
    return { ok: true, catID, events: parsed.events };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const deadlineReached = aborted && deadlineLimited;
    return {
      ok: false,
      catID,
      events: [],
      deadlineReached,
      error: deadlineReached
        ? "route deadline reached during fetch"
        : aborted
          ? `timed out after ${FEED_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : "feed fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * CivicEngage publishes the same UID through multiple category calendars.
 * Preserve one deterministic event (configured catID order), and only keep a
 * category when every occurrence agrees. This prevents loop order from
 * silently assigning a conflicting category.
 */
function dedupeEvents(
  src: Source,
  feedResults: readonly FeedResult[],
): { events: DedupedEvent[]; duplicates: number } {
  const byUid = new Map<
    string,
    {
      event: ParsedEvent;
      categories: Set<string | null>;
    }
  >();
  let duplicates = 0;

  for (const feed of feedResults) {
    if (!feed.ok) continue;
    const category = src.category_map[String(feed.catID)] ?? null;
    for (const event of feed.events) {
      const existing = byUid.get(event.uid);
      if (existing) {
        duplicates += 1;
        existing.categories.add(category);
      } else {
        byUid.set(event.uid, {
          event,
          categories: new Set([category]),
        });
      }
    }
  }

  return {
    events: [...byUid.values()].map(({ event, categories }) => ({
      event,
      category: categories.size === 1 ? [...categories][0] : null,
    })),
    duplicates,
  };
}

function summarizeFeedFailures(
  requested: number,
  failures: readonly Extract<FeedResult, { ok: false }>[],
): string | undefined {
  if (failures.length === 0) return undefined;
  const headline =
    failures.length === requested
      ? `all ${requested} category feeds failed`
      : `${failures.length} of ${requested} category feeds failed`;
  const shown = failures
    .slice(0, 3)
    .map((failure) => `catID ${failure.catID}: ${failure.error}`)
    .join(", ");
  const remainder =
    failures.length > 3 ? `, plus ${failures.length - 3} more` : "";
  return `${headline} (${shown}${remainder})`;
}

function sourceRunStatus({
  sourceFetchStatus,
  uniqueEvents,
  processed,
  processingError,
}: {
  sourceFetchStatus: FetchStatus;
  uniqueEvents: number;
  processed: number;
  processingError: boolean;
}): RunStatus {
  if (sourceFetchStatus === "failed") return "error";
  if (processingError) {
    return uniqueEvents > 0 && processed === 0 ? "error" : "partial";
  }
  return sourceFetchStatus === "partial" ? "partial" : "ok";
}

async function ingestSource(
  src: Source,
  sql: Sql | null,
  dry: boolean,
  deadlineAt: number,
): Promise<SourceResult> {
  const runId = !dry && sql ? await startIngestRun(sourceRunSlug(src)) : null;
  const stats = emptyStats();
  const feedResults = await mapWithConcurrency(
    src.catids,
    FEED_CONCURRENCY_PER_SOURCE,
    (catID) => fetchAndParseFeed(src, catID, deadlineAt),
  );
  const validFeeds = feedResults.filter(
    (result): result is Extract<FeedResult, { ok: true }> => result.ok,
  );
  const failedFeeds = feedResults.filter(
    (result): result is Extract<FeedResult, { ok: false }> => !result.ok,
  );
  const { events, duplicates } = dedupeEvents(src, feedResults);

  let processed = 0;
  let failedRecords = 0;
  let skippedRecords = 0;
  let deadlineError: string | undefined;
  const recordErrorSamples: string[] = [];
  if (!dry && sql) {
    for (const candidate of events) {
      if (remainingMs(deadlineAt) <= WRITE_START_BUFFER_MS) {
        skippedRecords = events.length - processed - failedRecords;
        deadlineError = `route deadline reached with ${skippedRecords} unique records not written`;
        break;
      }
      try {
        await upsertEvent(
          sql,
          {
            sourceDomain: src.domain,
            municipality: src.municipality,
            category: candidate.category,
            categoryCoverageComplete: failedFeeds.length === 0,
          },
          candidate.event,
          stats,
        );
        processed += 1;
      } catch (error) {
        // A deterministic poison row must not starve every later event in this
        // source. Continue until the route deadline while keeping telemetry
        // bounded to a few representative failures.
        failedRecords += 1;
        if (recordErrorSamples.length < 3) {
          const message =
            error instanceof Error ? error.message : "event upsert failed";
          recordErrorSamples.push(
            `${candidate.event.uid.slice(0, 80)}: ${message.slice(0, 240)}`,
          );
        }
      }
    }
  }

  const recordError =
    failedRecords > 0
      ? `${failedRecords} unique record${failedRecords === 1 ? "" : "s"} failed (${recordErrorSamples.join(", ")}${failedRecords > recordErrorSamples.length ? `, plus ${failedRecords - recordErrorSamples.length} more` : ""})`
      : undefined;
  const processingError =
    [recordError, deadlineError].filter(Boolean).join("; ") || undefined;
  const sourceFetchStatus = fetchStatus(src.catids.length, validFeeds.length);
  const recordFailures = dry ? 0 : failedRecords + skippedRecords;
  const feedError = summarizeFeedFailures(src.catids.length, failedFeeds);
  const error = [feedError, processingError].filter(Boolean).join("; ") || undefined;
  const deadlineReached =
    failedFeeds.some((failure) => failure.deadlineReached) ||
    Boolean(processingError?.includes("route deadline"));
  const status = sourceRunStatus({
    sourceFetchStatus,
    uniqueEvents: events.length,
    processed,
    processingError: Boolean(processingError),
  });
  const result: SourceResult = {
    status,
    ok: status === "ok",
    events: events.length,
    duplicates,
    fetchStatus: sourceFetchStatus,
    contentStatus: sourceContentStatus({
      dry,
      fetched: validFeeds.length,
      uniqueEvents: events.length,
      processed,
      stats,
      processingError: Boolean(processingError),
    }),
    feeds: {
      requested: src.catids.length,
      fetched: validFeeds.length,
      failed: failedFeeds.length,
    },
    records: {
      processed: dry ? 0 : processed,
      failed: recordFailures,
    },
    stats: dry ? undefined : stats,
    deadlineReached,
    ...(error ? { error } : {}),
  };

  if (runId) {
    await finishIngestRun(runId, {
      status,
      records_in: events.length,
      records_upserted: stats.normUpserted,
      records_failed: failedFeeds.length + recordFailures,
      error,
    });
  }
  return result;
}

function aggregateRunStatus(results: readonly SourceResult[]): RunStatus {
  if (results.length === 0) return "error";
  if (results.every((result) => result.status === "ok")) return "ok";
  return results.some((result) => result.status !== "error")
    ? "partial"
    : "error";
}

export async function GET(req: NextRequest) {
  // Dry runs still fetch every upstream feed, so they share the same cron gate.
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const startedAt = Date.now();
  const deadlineAt = startedAt + ROUTE_BUDGET_MS;
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const only = req.nextUrl.searchParams.get("only");

  const sql = getSql();
  if (!sql && !dry) {
    return Response.json({ error: "no database" }, { status: 503 });
  }

  const list = (sources as unknown as Source[]).filter(
    (source) =>
      source.enabled &&
      (!only ||
        source.municipality.toLowerCase() === only.toLowerCase()),
  );

  if (!dry && sql) {
    let missing: string[] = [];
    let preflightError: string | null = null;
    try {
      const readiness = await checkEventSchemaReadiness(sql, "civic-ingest");
      missing = readiness.missing;
    } catch (error) {
      preflightError = safeErrorCode(error) ?? "schema-check-failed";
    }

    if (missing.length > 0 || preflightError) {
      const detail = preflightError
        ? `Event ingest schema check failed (${preflightError}).`
        : `Event ingest schema is not ready: missing ${missing.join(", ")}.`;
      const failureRunSlug =
        only && list.length === 1
          ? sourceRunSlug(list[0])
          : AGGREGATE_RUN_SLUG;
      const failureRunId = await startIngestRun(failureRunSlug);
      await finishIngestRun(failureRunId, {
        status: "error",
        records_in: 0,
        records_upserted: 0,
        records_failed: 1,
        error: detail,
      });
      return Response.json({
        dry,
        status: "error",
        sources: list.length,
        totalParsed: 0,
        totalDuplicates: 0,
        totalChanged: 0,
        totalFailed: 0,
        perSource: {},
        schema: {
          ready: false,
          missing,
          error_code: preflightError,
        },
        cache: { invalidated: false },
        geocode: {
          status: "not_run",
          mode: "separate_schedule",
          scheduled: false,
        },
        deadlineReached: false,
        duration_ms: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
      }, { status: 503 });
    }
  }

  // A source-scoped manual run must not overwrite the daily all-source
  // heartbeat with an artificially green aggregate.
  const aggregateRunId =
    !dry && sql && !only
      ? await startIngestRun(AGGREGATE_RUN_SLUG)
      : null;

  const sourceResults = await mapWithConcurrency(
    list,
    SOURCE_CONCURRENCY,
    (source) => ingestSource(source, sql, dry, deadlineAt),
  );
  const perSource = Object.fromEntries(
    sourceResults.map((result, index) => [list[index].municipality, result]),
  );
  const totalParsed = sourceResults.reduce(
    (total, result) => total + result.events,
    0,
  );
  const totalDuplicates = sourceResults.reduce(
    (total, result) => total + result.duplicates,
    0,
  );
  const totalChanged = sourceResults.reduce(
    (total, result) => total + (result.stats?.normUpserted ?? 0),
    0,
  );
  const totalFailed = sourceResults.reduce(
    (total, result) =>
      total + result.feeds.failed + result.records.failed,
    0,
  );

  let status = aggregateRunStatus(sourceResults);
  const errors = sourceResults.flatMap((result, index) =>
    result.status === "ok"
      ? []
      : [`${list[index].municipality}: ${result.error ?? result.status}`],
  );

  // Only changed normalized rows can alter a user-facing event payload.
  // Failed and no-op runs retain the warm live-event caches.
  let cacheInvalidated = false;
  if (!dry && sql && totalChanged > 0) {
    try {
      revalidateTag("ingested-events", "max");
      revalidateTag("events", "max");
      cacheInvalidated = true;
    } catch (error) {
      status = status === "error" ? "error" : "partial";
      errors.push(
        `cache invalidation: ${
          error instanceof Error ? error.message : "failed"
        }`,
      );
    }
  }

  const aggregateError =
    errors.length > 0 ? errors.join("; ") : undefined;
  if (aggregateRunId) {
    await finishIngestRun(aggregateRunId, {
      status,
      records_in: totalParsed,
      records_upserted: totalChanged,
      records_failed: totalFailed,
      error: aggregateError,
    });
  }

  const responseBody = {
    dry,
    status,
    sources: list.length,
    totalParsed,
    totalDuplicates,
    totalChanged: dry ? undefined : totalChanged,
    totalFailed,
    perSource,
    cache: {
      invalidated: cacheInvalidated,
    },
    // Geocoding has its own production cost and deadline. It is deliberately
    // not part of this ingestion request; scheduling that separate job remains
    // explicit follow-up work.
    geocode: {
      status: "not_run",
      mode: "separate_schedule",
      scheduled: false,
    },
    deadlineReached: sourceResults.some((result) => result.deadlineReached),
    duration_ms: Date.now() - startedAt,
    finishedAt: new Date().toISOString(),
  };

  // Vercel and external uptime checks use HTTP status, not the JSON body, as
  // their failure signal. A total outage must fail the cron visibly; partial
  // source coverage remains a 200 with explicit degraded telemetry.
  return Response.json(responseBody, {
    status: status === "error" ? 502 : 200,
  });
}
