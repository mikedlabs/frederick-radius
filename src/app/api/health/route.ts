import { NextResponse } from "next/server";
import { getCachedPublicHealthSnapshot } from "@/lib/public-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // This is a liveness response with component status in its JSON body. It
  // deliberately remains HTTP 200 when a component is degraded so an uptime
  // probe can distinguish "the app answered" from "the database/feed layer
  // needs attention." Monitors must parse `readiness.surfaces`, migrations,
  // and heartbeats; HTTP status alone is not a release-readiness signal.
  return NextResponse.json(await getCachedPublicHealthSnapshot(), {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
