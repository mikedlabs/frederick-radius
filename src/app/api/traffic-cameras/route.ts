/**
 * Frederick-County CHART traffic cameras for the map's Cameras layer. Wraps
 * getChartCameras() (locations + live-video URLs, county-filtered) so the
 * client fetches a small list without the feed parsing in the bundle. [] when
 * CHART is unreachable.
 *
 *   GET /api/traffic-cameras → { cameras: TrafficCamera[] }
 */
import { NextResponse } from "next/server";
import { getChartCameras } from "@/lib/integrations/chartCameras";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const cameras = await getChartCameras().catch(() => []);
  return NextResponse.json(
    { cameras },
    { headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" } },
  );
}
