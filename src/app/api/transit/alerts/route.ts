/**
 * Frederick County TransIT service alerts — GTFS-realtime, decoded server-side.
 *
 * The response keeps provider availability separate from the alert count.
 * A successful empty feed means only that the provider published no alert
 * entity; clients must not translate it into a blanket "service is normal."
 */
import { NextResponse } from "next/server";
import { getTransitServiceAlertsResult } from "@/lib/integrations/transitRealtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getTransitServiceAlertsResult();
  return NextResponse.json(
    {
      alerts: result.data,
      updatedAt: result.receivedAt,
      status: result.status,
      available: result.available,
      feedTimestamp: result.feedTimestamp,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
