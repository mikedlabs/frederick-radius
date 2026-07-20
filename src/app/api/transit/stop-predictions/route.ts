/**
 * Live bus arrivals at a stop — GTFS-realtime TripUpdates, decoded server-side.
 *
 * Wraps getStopPredictions() (src/lib/integrations/transitRealtime.ts) so the
 * stop-tap detail on the transit map can read a small JSON payload without the
 * protobuf decoder in the client bundle. Pass ?stop= to filter to one stop's
 * arrivals server-side (the tap case); omit it for the full set. Realtime, so
 * no-store.
 *
 * TransIT publishes no static bus timetable, so arrivals are realtime only:
 * when no trip is inbound the array is empty and the UI says so honestly rather
 * than inventing a time. Returns [] gracefully when the feed is down.
 *
 *   GET /api/transit/stop-predictions?stop=162950
 *     -> { predictions: StopPrediction[], updatedAt: number }
 */
import { NextResponse } from "next/server";
import { getStopPredictions } from "@/lib/integrations/transitRealtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const stopId = new URL(request.url).searchParams.get("stop");
  const all = await getStopPredictions();
  const predictions = stopId ? all.filter((p) => p.stopId === stopId) : all;
  return NextResponse.json(
    { predictions, updatedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
