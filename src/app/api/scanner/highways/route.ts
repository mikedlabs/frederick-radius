/**
 * Live CHART highway incidents for the /scanner "on the highways" section —
 * crashes, disabled vehicles, and closures on the interstates and main routes,
 * from MDOT CHART. Distinct from the FredScanner block-level dispatch feed:
 * this is the state's official highway picture (road + direction + what's
 * affected). Wraps getChartIncidentsFrederick so the client polls a small
 * payload. [] when CHART is unreachable.
 *
 *   GET /api/scanner/highways → { incidents: ChartIncident[], updatedAt: number }
 */
import { NextResponse } from "next/server";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const incidents = await getChartIncidentsFrederick().catch(() => []);
  return NextResponse.json(
    { incidents, updatedAt: Date.now() },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
  );
}
