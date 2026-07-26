/**
 * Live bus arrivals at a stop — GTFS-realtime TripUpdates, decoded server-side.
 *
 * Wraps getStopPredictions() (src/lib/integrations/transitRealtime.ts) so the
 * stop-tap detail on the transit map can read a small JSON payload without the
 * protobuf decoder in the client bundle. Pass ?stop= to filter to one stop's
 * arrivals server-side (the tap case); omit it for the full set. Realtime, so
 * no-store.
 *
 * This endpoint serves realtime predictions. The separate committed GTFS
 * snapshot contains the official static schedule; callers must not mistake an
 * unavailable realtime feed for a confirmed lack of inbound service.
 *
 *   GET /api/transit/stop-predictions?stop=162950
 *     -> { predictions: StopPrediction[], updatedAt: number }
 */
import { NextResponse } from "next/server";
import { getStopPredictionsResult } from "@/lib/integrations/transitRealtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const stopId = new URL(request.url).searchParams.get("stop");
  const result = await getStopPredictionsResult();
  const predictions = stopId
    ? result.data.filter((p) => p.stopId === stopId)
    : result.data;
  return NextResponse.json(
    {
      predictions,
      // Preserve the old Radius-received timestamp for existing clients.
      updatedAt: result.receivedAt,
      status: result.status,
      available: result.available,
      feedTimestamp: result.feedTimestamp,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
