/**
 * Live TransIT vehicle positions — GTFS-realtime, decoded server-side.
 *
 * Wraps getLiveVehicles() (src/lib/integrations/transitRealtime.ts) so the
 * client can poll a small JSON payload without the protobuf/decoder in the
 * bundle. Realtime → no-store. Returns [] gracefully when the feed is down.
 *
 *   GET /api/transit/vehicles → { vehicles: LiveVehicle[], updatedAt: number }
 */
import { NextResponse } from "next/server";
import { getLiveVehicles } from "@/lib/integrations/transitRealtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const vehicles = await getLiveVehicles();
  return NextResponse.json(
    { vehicles, updatedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
