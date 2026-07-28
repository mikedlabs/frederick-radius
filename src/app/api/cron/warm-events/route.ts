/**
 * Cache-warming cron — keeps the live-event caches hot so a real visitor
 * never pays the cold-miss cost of fetching the slow municipal iCal/RSS
 * feeds at render time.
 *
 * WHY THIS EXISTS
 * ---------------
 * /today + /events read assembleUnifiedEvents (unstable_cache, 840s);
 * /map + the /events/[slug] resolver read getCachedLiveEvents (840s).
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
// /map browse feeds — the SAME loaders the browse map render awaits. They were
// NOT covered here (only the event caches were), so a cold /map visit paid the
// full live-fetch cost of all of them (measured: ~6-7s cold TTFB, ~500ms warm).
// Warming their shared Vercel Data Cache on the cron schedule means even a cold
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

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const t0 = Date.now();
  // Warm every cache key a user-facing render reads:
  //  - assembleUnifiedEvents → unified-events-v13   (/today, /events)
  //  - getCachedLiveEvents(60) → compact source pages (/map + unified set)
  //  - getCachedLiveEvents(90) → compact source pages (/events/[slug])
  // Each source page stays below the persistent-cache byte ceiling; warming
  // both horizons prevents a visitor from paying either cold source read.
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
