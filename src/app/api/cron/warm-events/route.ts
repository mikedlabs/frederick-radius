/**
 * Cache-warming cron — keeps the live-event caches hot so a real visitor
 * never pays the cold-miss cost of fetching the slow municipal iCal/RSS
 * feeds at render time.
 *
 * WHY THIS EXISTS
 * ---------------
 * /today + /events + /map read assembleUnifiedEvents (unstable_cache, 840s);
 * the durable event-archive worker reads getCachedLiveEvents (840s).
 * Visitor event details stay on seed/archive/database-only fallbacks and
 * never start this provider fanout.
 * Those caches are LAZY: an expired cache can block up to ~8s awaiting the
 * slowest upstream feed. Their explicit version keys survive ordinary
 * deploys, so a release itself no longer creates a cold first-visitor window.
 * (Vercel runtime errors: hundreds of `[ical-live] … RSS timed out` on
 * /today, /events, /map, /events/[slug], affecting 150+ users — the
 * "loads slow even on a fast network" symptom, which is server-side TTFB,
 * not bandwidth.)
 *
 * This cron pre-pays that fetch on a 15-minute schedule, so the chronically
 * slow feeds (mount-airy, county,
 * parks, thurmont, city-frederick) are pulled by the BACKGROUND job and
 * users only ever read a warm cache. It calls the SAME functions the
 * pages call, so it populates the SAME cache keys.
 *
 * Map-layer caches are warmed by /api/cron/warm-map on a staggered schedule.
 * Keeping that independent fanout out of this route leaves enough runtime
 * headroom for the event cache that Today and event detail actually require.
 * Durable identity writes are also independent: /api/cron/event-archive
 * reuses these hot cache products on a slower schedule, with its own database
 * budget and heartbeat. An archive backlog can no longer make this
 * user-facing cache warm look failed.
 */
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronAuth } from "../../ingest/_auth";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import {
  getCachedLiveEvents,
  withLiveEventFetchSession,
} from "@/lib/integrations/ical-live";
import { sendWarmFailureAlert, type WarmFailure } from "@/lib/integrations/alerts";
import { withDeadlineOutcome } from "@/lib/promise-deadline";
import {
  EVENT_ALERT_BUDGET_MS,
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
  // Warm every cache key a user-facing render reads:
  //  - assembleUnifiedEvents → current unified-events version (/today, /events, /map)
  //  - getCachedLiveEvents(90) → durable event-archive source horizon
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

  const unifiedUnavailable =
    unified.status === "fulfilled"
      ? [...new Set(unified.value.sourceHealth.unavailable)]
          .map((source) => source.trim())
          .filter(Boolean)
          .sort()
          .slice(0, 32)
      : [];
  const sourceDegraded =
    unified.status === "fulfilled"
    && unified.value.sourceHealth.degraded;
  const body = () => ({
    // `ok` answers whether both cache writes completed. Source health is a
    // separate truth: a fail-soft warm can be operationally complete while
    // one publisher is unavailable.
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
