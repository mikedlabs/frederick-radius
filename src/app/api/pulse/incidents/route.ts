import { NextResponse } from "next/server";
import { getLiveIncidentSnapshot } from "@/lib/live/incidentSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A small, privacy-filtered snapshot for Pulse. An empty items array is
 * deliberately neutral: it does not claim that Frederick County is all clear.
 */
export async function GET() {
  const snapshot = await getLiveIncidentSnapshot();

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    },
  });
}
