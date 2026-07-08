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
 *
 * Two callers hit this route: the 5-minute Vercel cron, and a deploy-time
 * boot kick from src/instrumentation.ts (`?source=boot`) that closes the
 * post-deploy cold window the cron alone leaves open (up to 5 minutes of
 * cold-miss TTFB after every SHA-keyed cache bust). Boot kicks are deduped
 * per deploy — see claimBootWarm below.
 */
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { verifyCronAuth } from "../../ingest/_auth";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { getCachedLiveEvents } from "@/lib/integrations/ical-live";
import { sendWarmFailureAlert, type WarmFailure } from "@/lib/integrations/alerts";
// /map browse feeds — the SAME loaders the browse map render awaits. They were
// NOT covered here (only the event caches were), so a cold /map visit paid the
// full live-fetch cost of all of them (measured: ~6-7s cold TTFB, ~500ms warm).
// Warming their shared Vercel Data Cache on the 5-min schedule means even a cold
// lambda reads them from cache and paints fast. Purely additive + fail-soft.
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFixItIssues } from "@/lib/integrations/seeclickfix";
import { fetchMapillaryTrash } from "@/lib/integrations/mapillary";
import { getFrederickTrailShapes } from "@/lib/integrations/fcTrails";
import { getFrederickTransitRouteShapes } from "@/lib/integrations/transitFrederick";
import { getMunicipalBoundaries, getCountyBoundary } from "@/lib/integrations/fcGis";
import { getFrederickWaterSites } from "@/lib/integrations/usgsWater";
import { getEvChargingStations } from "@/lib/integrations/evCharging";
import { getHistoricCemeteries } from "@/lib/integrations/fcCemeteries";
import { getCommunityReports } from "@/lib/loaders/communityReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The cron is the patient path: it can wait out the slow feeds (each
// capped at the 8s per-feed timeout) so users never have to.
export const maxDuration = 90;

function errMsg(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Boot-kick dedupe (instrumentation.ts fires `?source=boot` on every lambda
 * cold start, for the deployment's whole life — not just the first one after
 * deploy). One Data Cache entry keyed by the deploy SHA turns all but the
 * first kick per deploy into instant no-ops:
 *
 * Each route instance has its own random CLAIM_ID. The first boot kick per
 * deploy computes the cache entry, storing ITS instance's id; that instance
 * sees its own id come back and proceeds to warm. Every later kick reads the
 * first instance's id, sees it isn't theirs, and skips. A same-instance repeat
 * (the cached id matches by construction) is caught by the local boolean.
 * Two kicks racing before the entry lands both warm — harmless, the warm is a
 * read-through. If the claimed warm then FAILS there is no boot-level retry;
 * the 5-minute cron is the backstop, and the failure path below still alerts.
 * The cron itself (no ?source=boot) is never deduped.
 */
const BOOT_CLAIM_ID = Math.random().toString(36).slice(2);
let bootWarmedThisInstance = false;
const claimBootWarm = unstable_cache(
  async () => BOOT_CLAIM_ID,
  ["warm-events-boot-claim", process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"],
  { revalidate: false },
);

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (new URL(request.url).searchParams.get("source") === "boot") {
    // Fail-open: a cache error means we can't prove another instance already
    // warmed, so warm anyway (worst case is a redundant read-through).
    const claimed = await claimBootWarm().catch(() => BOOT_CLAIM_ID);
    if (claimed !== BOOT_CLAIM_ID || bootWarmedThisInstance) {
      return NextResponse.json({ ok: true, skipped: "already-warmed-this-deploy" });
    }
    bootWarmedThisInstance = true;
  }

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

  // Warm the /map browse feeds too (their caches, not the event caches above).
  // Fire-and-report: a rejected map-feed warm is noted but does NOT fail the
  // whole cron the way an event-cache miss does — the map self-hides each empty
  // layer, so a stale map feed degrades far more gently than stale events.
  const MAP_FEEDS: Array<[string, () => Promise<unknown>]> = [
    ["chart", () => getChartIncidentsFrederick()],
    ["fixit", () => getFixItIssues(30)],
    ["mapillary", () => fetchMapillaryTrash()],
    ["trails", () => getFrederickTrailShapes()],
    ["transit", () => getFrederickTransitRouteShapes()],
    ["muni-bounds", () => getMunicipalBoundaries()],
    ["county-bounds", () => getCountyBoundary()],
    ["water", () => getFrederickWaterSites()],
    ["ev", () => getEvChargingStations()],
    ["cemeteries", () => getHistoricCemeteries()],
    ["reports", () => getCommunityReports()],
  ];
  const mapResults = await Promise.allSettled(MAP_FEEDS.map(([, fn]) => fn()));
  const mapFeeds: Record<string, boolean> = {};
  mapResults.forEach((r, i) => {
    mapFeeds[MAP_FEEDS[i][0]] = r.status === "fulfilled";
  });

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

  const body = { ok: failures.length === 0, duration_ms: Date.now() - t0, warmed, mapFeeds };

  if (failures.length > 0) {
    Sentry.captureMessage(
      `warm-events: ${failures.length} cache(s) failed to warm`,
      { level: "warning", extra: { failures } },
    );
    // Await (not void) so the Slack POST flushes before the serverless function
    // can freeze post-response — the response is already 500, so there's no
    // latency cost to the user. sendWarmFailureAlert always resolves.
    await sendWarmFailureAlert(failures);
    return NextResponse.json(body, { status: 500 });
  }

  return NextResponse.json(body);
}
