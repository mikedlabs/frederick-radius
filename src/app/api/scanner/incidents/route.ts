/**
 * Live public scanner incidents for the map's Incidents layer.
 *
 * Wraps getGeocodedScannerIncidents() so the client polls a small JSON payload
 * without the Slack fetch, the privacy allowlist, or the geocoder in the
 * bundle. Only public, non-medical, in-county-geocoded incidents come back
 * (medical/personal calls are already dropped upstream). Returns [] gracefully
 * when the feed is dormant (no bot token) or down.
 *
 *   GET /api/scanner/incidents → { incidents: GeocodedIncident[], updatedAt: number }
 */
import { NextResponse } from "next/server";
import { getGeocodedScannerIncidents } from "@/lib/integrations/scannerIncidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const incidents = await getGeocodedScannerIncidents().catch(() => []);
  return NextResponse.json(
    { incidents, updatedAt: Date.now() },
    // Short shared cache: the feed updates ~minutely and the loader is itself
    // 60s-cached, so this bounds upstream load without feeling stale.
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
  );
}
