/**
 * Live MARC train positions — GTFS-realtime, decoded server-side.
 *
 * Wraps getMarcVehicles() (src/lib/integrations/marcVehicles.ts) so the
 * client can poll a small JSON payload without the protobuf decoder in the
 * bundle — the same split as /api/transit/vehicles for TransIT buses. The
 * server filters to the Brunswick Line corridor (county bbox + ~40 km) and
 * slims each train to what the marker needs. Realtime → no-store. Returns
 * [] gracefully when the feed is down.
 *
 *   GET /api/transit/marc-vehicles → { vehicles: MarcVehicle[], updatedAt: number }
 */
import { NextResponse } from "next/server";
import { getMarcVehicles } from "@/lib/integrations/marcVehicles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const vehicles = await getMarcVehicles();
  return NextResponse.json(
    { vehicles, updatedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
