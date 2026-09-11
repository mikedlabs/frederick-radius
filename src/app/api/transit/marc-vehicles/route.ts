/**
 * Live MARC train positions — GTFS-realtime, decoded server-side.
 *
 * Wraps getMarcVehicles() (src/lib/integrations/marcVehicles.ts) so the
 * client can poll a small JSON payload without the protobuf decoder in the
 * bundle — the same split as /api/transit/vehicles for TransIT buses. The
 * server first requires the Brunswick Line route id, then applies the corridor
 * sanity check (county bbox + ~40 km), and slims each train to what the marker
 * needs. Realtime → no-store.
 *
 * Existing clients can keep reading `vehicles` + `updatedAt`; new clients can
 * distinguish no Brunswick trains from an unavailable provider feed.
 */
import { NextResponse } from "next/server";
import { getMarcVehiclesResult } from "@/lib/integrations/marcVehicles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getMarcVehiclesResult();
  return NextResponse.json(
    {
      vehicles: result.data,
      // Preserve the old Radius-received timestamp for existing clients.
      updatedAt: result.receivedAt,
      status: result.status,
      available: result.available,
      feedTimestamp: result.feedTimestamp,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
