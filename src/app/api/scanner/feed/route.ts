/**
 * Live public scanner incidents for the /scanner board (list form, no
 * geocoding — the page shows every public call, not just the mappable ones).
 * Wraps getScannerIncidentsResult() so the client polls a small JSON payload
 * without the Slack fetch or the allowlist in the bundle. Successful-empty is
 * distinct from unavailable: a provider timeout is not an all-clear.
 *
 *   GET /api/scanner/feed → { incidents: ScannerIncident[], updatedAt: number }
 */
import { NextResponse } from "next/server";
import {
  getScannerIncidentsResult,
  type ScannerIncidentsResult,
} from "@/lib/integrations/scannerIncidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getScannerIncidentsResult().catch((): ScannerIncidentsResult => ({
    data: [],
    available: false,
    reason: "internal_error" as const,
  }));
  return NextResponse.json(
    {
      status: result.available ? "available" : "unavailable",
      incidents: result.data,
      source: result.source ?? null,
      reason: result.available ? null : result.reason ?? "upstream_unavailable",
      asOf: result.asOf ?? null,
      updatedAt: Date.now(),
    },
    {
      status: result.available ? 200 : 503,
      headers: {
        "Cache-Control": result.available
          ? "public, max-age=30, stale-while-revalidate=60"
          : "no-store, max-age=0",
      },
    },
  );
}
