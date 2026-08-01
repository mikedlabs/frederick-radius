/**
 * Live public scanner incidents for the map's Incidents layer.
 *
 * Wraps getGeocodedScannerIncidents() so the client polls a small JSON payload
 * without the Slack fetch, the privacy allowlist, or the geocoder in the
 * bundle. Only public, non-medical, in-county-geocoded incidents come back
 * (medical/personal calls are already dropped upstream). It fails soft while
 * preserving source availability and projection counts when upstream is down.
 *
 * The counts keep "no safe map pin" distinct from "no public reports."
 */
import { NextResponse } from "next/server";
import {
  getGeocodedScannerIncidentsResult,
  type GeocodedScannerIncidentsResult,
} from "@/lib/integrations/scannerIncidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getGeocodedScannerIncidentsResult().catch(
    (): GeocodedScannerIncidentsResult => ({
      data: [],
      available: false,
      rawCount: 0,
      geocodedCount: 0,
    }),
  );
  return NextResponse.json(
    {
      incidents: result.data,
      available: result.available,
      reportedCount: result.rawCount,
      mappedCount: result.geocodedCount,
      unmappedCount: Math.max(0, result.rawCount - result.geocodedCount),
      updatedAt: Date.now(),
    },
    // Short shared cache: the feed updates ~minutely and the loader is itself
    // 60s-cached, so this bounds upstream load without feeling stale.
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
  );
}
