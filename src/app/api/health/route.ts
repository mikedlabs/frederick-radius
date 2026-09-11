import { NextResponse } from "next/server";
import { getCachedPublicHealthSnapshot } from "@/lib/public-health";
import {
  publicDataSnapshot,
  publicHoursProductHealth,
} from "@/lib/public-data-snapshot";
import type { PublicSurfaceReadiness } from "@/lib/quality/surface-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function markCurrentHoursPolicyHold(
  surface: PublicSurfaceReadiness,
): PublicSurfaceReadiness {
  return {
    ...surface,
    status: surface.status === "hold" ? "hold" : "partial",
    reasons: surface.reasons.includes("current_hours_policy_hold")
      ? surface.reasons
      : [...surface.reasons, "current_hours_policy_hold"],
  };
}

export async function GET() {
  // This is a liveness response with component status in its JSON body. It
  // deliberately remains HTTP 200 when a component is degraded so an uptime
  // probe can distinguish "the app answered" from "the database/feed layer
  // needs attention." Monitors must parse `readiness.surfaces`, migrations,
  // and heartbeats; HTTP status alone is not a release-readiness signal.
  const health = await getCachedPublicHealthSnapshot();
  const release = publicDataSnapshot();
  const hours = publicHoursProductHealth(release);
  const readiness = hours.status === "policy_hold"
    ? {
        ...health.readiness,
        status: health.readiness.status === "hold" ? "hold" : "partial",
        surfaces: {
          ...health.readiness.surfaces,
          today: markCurrentHoursPolicyHold(health.readiness.surfaces.today),
          ask: markCurrentHoursPolicyHold(health.readiness.surfaces.ask),
          map: markCurrentHoursPolicyHold(health.readiness.surfaces.map),
        },
        capabilities: {
          currentHours: {
            status: "policy_hold",
            affectedSurfaces: ["today", "ask", "map"],
            message: hours.operatorMessage,
          },
        },
      }
    : health.readiness;
  return NextResponse.json({
    ...health,
    status:
      health.status === "operational" &&
      (hours.status === "current" || hours.status === "policy_hold")
        ? "operational"
        : "degraded",
    readiness,
    products: { hours },
    release,
  }, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
