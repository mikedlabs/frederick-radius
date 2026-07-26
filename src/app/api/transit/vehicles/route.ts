/**
 * Live TransIT vehicle positions — GTFS-realtime, decoded server-side.
 *
 * Wraps getLiveVehiclesWithNextStop() (src/lib/integrations/transitRealtime.ts)
 * so the client can poll a small JSON payload without the protobuf/decoder in
 * the bundle. Each vehicle is decorated server-side with its resolved next
 * stop (name + coord + ETA) by joining VehiclePositions to TripUpdates, so the
 * client renders a flight-tracker "next stop" without a second feed or the
 * join logic in the bundle. Realtime → no-store. Returns [] gracefully when
 * the feed is down.
 *
 * Existing clients can keep reading `vehicles` + `updatedAt`. New clients can
 * also read `status`, `available`, `feedTimestamp`, and the per-feed `feeds`
 * metadata to distinguish an empty live feed from an upstream outage.
 */
import { NextResponse } from "next/server";
import { getLiveVehiclesWithNextStopResult } from "@/lib/integrations/transitRealtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getLiveVehiclesWithNextStopResult();
  return NextResponse.json(
    {
      vehicles: result.data,
      // Preserve the old Radius-received timestamp for existing clients.
      updatedAt: result.receivedAt,
      status: result.status,
      available: result.available,
      feedTimestamp: result.feedTimestamp,
      feeds: result.feeds,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
