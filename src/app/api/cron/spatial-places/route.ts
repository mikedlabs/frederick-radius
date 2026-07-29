import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { syncSpatialPlaceMirror } from "@/lib/spatial/place-mirror";

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

  try {
    const result = await syncSpatialPlaceMirror();
    return NextResponse.json({
      enabled: true,
      healthy: true,
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
  }
}

export async function POST(request: Request) {
  return GET(request);
}
