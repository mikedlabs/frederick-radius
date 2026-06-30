/**
 * Cache-warming cron — keeps the live-event caches hot so a real visitor
 * never pays the cold-miss cost of fetching the slow municipal iCal/RSS
 * feeds at render time.
 *
 * WHY THIS EXISTS
 * ---------------
 * /today + /events read assembleUnifiedEvents (unstable_cache, 300s);
 * /map + the /events/[slug] resolver read getCachedLiveEvents (300s).
 * Those caches are LAZY: the first request in each 5-minute window — and
 * EVERY request in the cold window right after a deploy busts the
 * SHA-keyed cache — blocks up to ~8s awaiting the slowest upstream feed.
 * (Vercel runtime errors: hundreds of `[ical-live] … RSS timed out` on
 * /today, /events, /map, /events/[slug], affecting 150+ users — the
 * "loads slow even on a fast network" symptom, which is server-side TTFB,
 * not bandwidth.)
 *
 * This cron pre-pays that fetch on a schedule (every 5 min, matching the
 * revalidate window), so the chronically slow feeds (mount-airy, county,
 * parks, thurmont, city-frederick) are pulled by the BACKGROUND job and
 * users only ever read a warm cache. It calls the SAME functions the
 * pages call, so it populates the SAME cache keys.
 *
 * It only READS through the existing cache functions — no DB writes, no
 * new data path, no change to the unified assembly — so it is purely
 * additive and fail-soft: a warm miss just means the next user
 * repopulates as before, never worse than today.
 */
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronAuth } from "../../ingest/_auth";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { getCachedLiveEvents } from "@/lib/integrations/ical-live";
import { sendWarmFailureAlert, type WarmFailure } from "@/lib/integrations/alerts";

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
  //  - assembleUnifiedEvents → unified-events-v13   (/today, /events)
  //  - getCachedLiveEvents(60) → live-events-v2/60   (/map + unified live set)
  //  - getCachedLiveEvents(90) → live-events-v2/90   (/events/[slug] resolver)
  const [unified, live60, live90] = await Promise.allSettled([
    assembleUnifiedEvents(new Date()),
    getCachedLiveEvents(60),
    getCachedLiveEvents(90),
  ]);

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
    live60: summarize(
      "live60",
      live60,
      live60.status === "fulfilled" ? live60.value.events.length : 0,
    ),
    live90: summarize(
      "live90",
      live90,
      live90.status === "fulfilled" ? live90.value.events.length : 0,
    ),
  };

  const body = { ok: failures.length === 0, duration_ms: Date.now() - t0, warmed };

  if (failures.length > 0) {
    void sendWarmFailureAlert(failures);
    Sentry.captureMessage(
      `warm-events: ${failures.length} cache(s) failed to warm`,
      { level: "warning", extra: { failures } },
    );
    return NextResponse.json(body, { status: 500 });
  }

  return NextResponse.json(body);
}
