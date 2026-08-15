import { NextResponse } from "next/server";
import { getStoredFoodTruckSchedule } from "@/lib/food-trucks/schedule-loader";
import { evaluateFoodTruckScheduleHealth } from "@/lib/quality/food-truck-schedule-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Compact public proof of the same durable schedule Today reads.
 *
 * This deliberately exposes counts and freshness, not internal errors or
 * source URLs. The production canary uses it to prove that a successful
 * collector run produced a readable public artifact.
 */
export async function GET() {
  const checkedAt = new Date();
  const schedule = await getStoredFoodTruckSchedule(checkedAt).catch(() => null);

  if (!schedule) {
    return NextResponse.json({
      ok: false,
      status: "unavailable",
      checkedAt: checkedAt.toISOString(),
      generatedAt: null,
      window: null,
      counts: {
        stops: null,
        sources: null,
        healthySources: null,
        failedSources: null,
        productiveSources: null,
        retainedStops: null,
        suspiciousSources: null,
        vendorMentions: null,
        canonicalVendorLinks: null,
      },
    }, { status: 503, headers: cacheHeaders });
  }

  const health = evaluateFoodTruckScheduleHealth(schedule, checkedAt);
  const suspiciousSources =
    health.suspiciousZeroSources.length + health.suspiciousDropSources.length;

  return NextResponse.json({
    ok: health.green,
    status: health.green ? "current" : "degraded",
    checkedAt: checkedAt.toISOString(),
    generatedAt: schedule.generatedAt,
    window: {
      startsAt: schedule.windowStart,
      endsAt: schedule.windowEnd,
    },
    counts: {
      stops: health.stopCount,
      sources: health.trackedSources,
      healthySources: health.successfulSources,
      failedSources: health.failedSources.length,
      productiveSources: health.productiveSources,
      retainedStops: health.retainedStopCount,
      suspiciousSources,
      vendorMentions: health.vendorMentions,
      canonicalVendorLinks: health.canonicalVendorLinks,
    },
  }, { status: 200, headers: cacheHeaders });
}
