/**
 * Live public scanner incidents for the /scanner board (list form, no
 * geocoding — the page shows every public call, not just the mappable ones).
 * Wraps getScannerIncidents() so the client polls a small JSON payload without
 * the Slack fetch or the allowlist in the bundle. [] when dormant or down.
 *
 *   GET /api/scanner/feed → { incidents: ScannerIncident[], updatedAt: number }
 */
import { NextResponse } from "next/server";
import { getScannerIncidents } from "@/lib/integrations/scannerIncidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const incidents = await getScannerIncidents().catch(() => []);
  return NextResponse.json(
    { incidents, updatedAt: Date.now() },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
  );
}
