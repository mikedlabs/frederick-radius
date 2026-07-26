/**
 * Scanner archive cron — banks the live public incident feed into history.
 *
 * Every 15 minutes it appends any public incidents not yet stored (the live
 * feed keeps ~1h, so 15-min runs overlap and the unique dedupe_key drops the
 * repeats). No-op until the FredScanner feed is configured AND the
 * scanner_incidents table is migrated — both fail soft. Auth: the same
 * CRON_SECRET bearer as the other crons.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { archiveScannerIncidents } from "@/lib/scanner/incidentArchive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const result = await archiveScannerIncidents().catch(() => ({
    seen: 0,
    inserted: 0,
    complete: false,
  }));
  return NextResponse.json({ ran_at: new Date().toISOString(), ...result });
}
