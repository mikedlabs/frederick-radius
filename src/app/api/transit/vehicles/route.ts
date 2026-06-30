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
 *   GET /api/transit/vehicles → { vehicles: LiveVehicle[], updatedAt: number }
 */
import { NextResponse } from "next/server";
import { getLiveVehiclesWithNextStop } from "@/lib/integrations/transitRealtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const vehicles = await getLiveVehiclesWithNextStop();
  return NextResponse.json(
    { vehicles, updatedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
