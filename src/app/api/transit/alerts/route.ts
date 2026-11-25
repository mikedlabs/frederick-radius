/**
 * Frederick County TransIT service alerts — GTFS-realtime, decoded server-side.
 *
 * The response keeps provider availability separate from the alert count.
 * A successful empty feed means only that the provider published no alert
 * entity; clients must not translate it into a blanket "service is normal."
 */
import { COUNTY_TRANSIT_BULLETIN_URL, transitBulletinForDisplay } from "@/lib/transit-service-calendar";
import { easternDayKey } from "@/lib/tz";
import { NextResponse } from "next/server";
import { getTransitServiceAlertsResult } from "@/lib/integrations/transitRealtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getTransitServiceAlertsResult();
  const bulletin = transitBulletinForDisplay(easternDayKey(new Date(result.receivedAt)));
  return NextResponse.json(
    {
      alerts: result.data,
      countyBulletin: bulletin?.county ?? [],
      countyBulletinSource: bulletin ? COUNTY_TRANSIT_BULLETIN_URL : null,
      updatedAt: result.receivedAt,
      status: result.status,
      available: result.available,
      feedTimestamp: result.feedTimestamp,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Vercel-CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      },
    },
  );
}
