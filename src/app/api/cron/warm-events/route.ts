/**
 * Warm the existing publisher products and the durable discovery read.
 *
 * Events SSR and /api/events/browse share one successful-envelope cache.
 * Warm that bounded archive read first; it never calls a publisher or model.
 * The existing source-fetch session then fills the unified and90-day source
 * products once per source. The separate event-archive job remains the writer;
 * this route does not import records or repeat its identity-write workload.
 *
 * The schedule, source budgets, authentication and separate map warmer stay
 * unchanged. A failed required warm remains visible through the existing
 * failure summary. Source freshness is reported separately from usable rows.
 */
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronAuth } from "../../ingest/_auth";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { loadEventArchiveSnapshot } from "@/lib/loaders/todayEventSnapshot";
import {
  getCachedLiveEvents,
  withLiveEventFetchSession,
} from "@/lib/integrations/ical-live";
import { sendWarmFailureAlert, type WarmFailure } from "@/lib/integrations/alerts";
import { withDeadlineOutcome } from "@/lib/promise-deadline";
import {
  EVENT_ALERT_BUDGET_MS,
  EVENT_BROWSE_ARCHIVE_WARM_BUDGET_MS,
  EVENT_WARM_BUDGET_MS,
} from "./config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The cron is the patient path: it can wait out the slow feeds (each
// capped at the 8s per-feed timeout) so users never have to.
export const maxDuration = 90;

function errMsg(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const t0 = Date.now();
  // This is the same bounded durable read used by Events SSR and browsing.
  // Start it before source assembly can occupy the shared pooled connection.
  // No publishers, collectors, geocoders or models are invoked by this read.
  const browseArchiveOutcome = await withDeadlineOutcome(
    loadEventArchiveSnapshot(new Date(), { cache: true }),
    EVENT_BROWSE_ARCHIVE_WARM_BUDGET_MS,
  );
  const archiveReadFailed = browseArchiveOutcome.status === "fulfilled"
    && browseArchiveOutcome.value.sourceHealth.issues.some((issue) =>
      issue.code === "event_archive_timeout" || issue.code === "event_archive_unavailable");
  const browseArchive: PromiseSettledResult<Awaited<ReturnType<typeof loadEventArchiveSnapshot>>> =
    browseArchiveOutcome.status === "fulfilled" && !archiveReadFailed
      ? { status: "fulfilled", value: browseArchiveOutcome.value }
      : { status: "rejected", reason: new Error(
          browseArchiveOutcome.status === "timed_out"
            ? "browse archive warm exceeded its budget"
            : "browse archive read unavailable",
        ) };
  // Retain the existing publisher/assembly products for their consumers:
  //  - assembleUnifiedEvents → unified discovery/collection product
  //  - getCachedLiveEvents(90) → durable event-archive writer's source horizon
  // Each source page stays below the persistent-cache byte ceiling; warming
  // the archive horizon keeps durable identity current without making a
  // visitor pay for a cold source read.
  //
  // The two cache products have to remain distinct, but their cold fills do
  // not need two upstream waterfalls. This request-scoped session pulls
  // each live source once at the widest (90-day) horizon, then derives the
  // unified 60-day view while every existing persistent cache keeps its own
  // bounded pages and exact key.
  type UnifiedWarm = Awaited<
    ReturnType<typeof assembleUnifiedEvents>
  >;
  type Live90Warm = Awaited<
    ReturnType<typeof getCachedLiveEvents>
  >;
  let unifiedMilestone:
    | PromiseSettledResult<UnifiedWarm>
    | undefined;
  let live90Milestone:
    | PromiseSettledResult<Live90Warm>
    | undefined;
  const observe = async <T>(
    name: "unified" | "live90",
    promise: Promise<T>,
    onSettled: (result: PromiseSettledResult<T>) => void,
  ): Promise<T> => {
    try {
      const value = await promise;
      onSettled({ status: "fulfilled", value });
      console.info(
        `[warm-events] ${name} settled in ${Date.now() - t0}ms`,
      );
      return value;
    } catch (reason) {
      onSettled({ status: "rejected", reason });
      console.warn(
        `[warm-events] ${name} rejected after ${Date.now() - t0}ms`,
      );
      throw reason;
    }
  };

  console.info("[warm-events] event phase started");
  const eventPhase = await withDeadlineOutcome(
    withLiveEventFetchSession(() =>
      Promise.allSettled([
        observe(
          "unified",
          assembleUnifiedEvents(new Date()),
          (result) => {
            unifiedMilestone = result;
          },
        ),
        observe(
          "live90",
          getCachedLiveEvents(90),
          (result) => {
            live90Milestone = result;
          },
        ),
      ] as const),
    ),
    EVENT_WARM_BUDGET_MS,
  );
  const phaseFailure = new Error(
    eventPhase.status === "timed_out"
      ? "event warm phase exceeded its budget"
      : "event warm phase failed",
  );
  let unified: PromiseSettledResult<UnifiedWarm>;
  let live90: PromiseSettledResult<Live90Warm>;
  if (eventPhase.status === "fulfilled") {
    [unified, live90] = eventPhase.value;
  } else {
    unified = unifiedMilestone ?? {
      status: "rejected",
      reason: phaseFailure,
    };
    live90 = live90Milestone ?? {
      status: "rejected",
      reason: phaseFailure,
    };
  }
  console.info(
    `[warm-events] event phase ${eventPhase.status} in ${Date.now() - t0}ms`,
  );

  // obs-3: this cron is the ONLY thing between users and cold-miss TTFB, so a
  // rejected warm must be loud — not silently 200'd (which Vercel records as
  // "succeeded"). Collect failures, alert + capture, and return non-200 so the
  // Vercel cron-failure surface lights up.
  const failures: WarmFailure[] = [];
  const summarize = (
    cache: string,
    r: PromiseSettledResult<unknown>,
    count: number,
  ) => {
    if (r.status === "fulfilled") return { ok: true, count };
    const error = errMsg(r.reason);
    failures.push({ cache, error });
    return { ok: false, error };
  };

  const warmed = {
    browseArchive: summarize(
      "browseArchive",
      browseArchive,
      browseArchive.status === "fulfilled" ? browseArchive.value.publicEvents.length : 0,
    ),
    unified: summarize(
      "unified",
      unified,
      unified.status === "fulfilled" ? unified.value.unified.length : 0,
    ),
    live90: summarize(
      "live90",
      live90,
      live90.status === "fulfilled" ? live90.value.events.length : 0,
    ),
  };

  const unifiedUnavailable = [...new Set([
    ...(unified.status === "fulfilled" ? unified.value.sourceHealth.unavailable : []),
    ...(browseArchive.status === "fulfilled" ? browseArchive.value.sourceHealth.unavailable : []),
  ])]
    .map((source) => source.trim())
    .filter(Boolean)
    .sort()
    .slice(0, 32);
  const sourceDegraded =
    (unified.status === "fulfilled" && unified.value.sourceHealth.degraded)
    || (browseArchive.status === "fulfilled" && browseArchive.value.sourceHealth.degraded);
  const body = () => ({
    // `ok` answers whether the required warm reads returned usable answers.
    // Source health is separate: returned rows do not prove a fresh publisher
    // or that a background cache revalidation succeeded.
    ok: failures.length === 0,
    healthy: failures.length === 0 && !sourceDegraded,
    degraded: failures.length > 0 || sourceDegraded,
    duration_ms: Date.now() - t0,
    warmed,
    source_health: {
      degraded: sourceDegraded,
      unavailable: unifiedUnavailable,
    },
  });

  if (failures.length > 0) {
    Sentry.captureMessage(
      `warm-events: ${failures.length} cache(s) failed to warm`,
      { level: "warning", extra: { failures } },
    );
    // Await (not void) so the Slack POST flushes before the serverless function
    // can freeze post-response — the response is already 500, so there's no
    // latency cost to the user. sendWarmFailureAlert always resolves.
    await withDeadlineOutcome(
      sendWarmFailureAlert(failures),
      EVENT_ALERT_BUDGET_MS,
    );
    return NextResponse.json(body(), { status: 500 });
  }

  return NextResponse.json(body());
}
