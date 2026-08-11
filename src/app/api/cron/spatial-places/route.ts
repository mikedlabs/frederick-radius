import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { syncSpatialPlaceMirror } from "@/lib/spatial/place-mirror";
import {
  createAbortDeadline,
  withDeadlineOutcome,
} from "@/lib/promise-deadline";
import {
  SPATIAL_CANCEL_GRACE_MS,
  SPATIAL_STATEMENT_TIMEOUT_MS,
  SPATIAL_SYNC_BUDGET_MS,
} from "./config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (process.env.RADIUS_POSTGIS_SYNC !== "1") {
    return NextResponse.json({
      enabled: false,
      note:
        "Set RADIUS_POSTGIS_SYNC=1 after applying and verifying drizzle/0037_places_postgis.sql.",
    });
  }

  const deadline = createAbortDeadline(SPATIAL_SYNC_BUDGET_MS);
  try {
    const outcome = await withDeadlineOutcome(
      syncSpatialPlaceMirror({
        signal: deadline.signal,
        statementTimeoutMs: SPATIAL_STATEMENT_TIMEOUT_MS,
      }),
      SPATIAL_SYNC_BUDGET_MS + SPATIAL_CANCEL_GRACE_MS,
    );
    if (outcome.status !== "fulfilled") {
      throw new Error(
        outcome.status === "timed_out"
          ? "Spatial mirror cancellation did not settle inside its grace period."
          : "Spatial mirror sync rejected before completion.",
      );
    }
    const result = outcome.value;
    return NextResponse.json({
      enabled: true,
      healthy: true,
      checked: result.checked,
      changed: result.upserted,
      upserted: result.upserted,
      retired: result.retired,
      current: result.audit.current,
      place_count: result.audit.activeCount,
      synced_at: result.audit.syncedAt,
    });
  } catch (error) {
    console.error("[cron/spatial-places] sync failed:", error);
    return NextResponse.json(
      {
        enabled: true,
        healthy: false,
        error:
          "The PostGIS place mirror did not refresh. Existing nearby behavior remains active.",
      },
      { status: 503 },
    );
  } finally {
    deadline.dispose();
  }
}

export async function POST(request: Request) {
  return GET(request);
}
