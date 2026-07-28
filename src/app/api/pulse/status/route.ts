import { NextResponse } from "next/server";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import { selectPulseStatus } from "@/lib/live/currentSituationModel";

/**
 * /api/pulse/status — lightweight summary of /pulse content for
 * the header indicator. Returns the minimum payload needed to
 * decide whether to show a "something's up" dot, and what tone
 * to paint it.
 *
 * Pulls NWS alerts, FCPS notices, MD traffic incidents, electric outages,
 * privacy-filtered PulsePoint calls, and AirNow observations, then reduces
 * them to:
 *   - active: boolean — anything worth showing?
 *   - count:  number  — total active items across all feeds
 *   - tone:   "alert" (weather/severe-incident grade), "caution"
 *             (school/elevated-air), or "quiet" (none)
 *
 * Cached 5 min via Next's revalidate so a polled header indicator
 * doesn't hammer the source feeds. The /pulse page itself uses
 * the same underlying calls with their own cache windows, so the
 * data is consistent across surfaces.
 */
export const revalidate = 300;

export async function GET() {
  const status = selectPulseStatus(await getCurrentSituationSnapshot());

  return NextResponse.json(
    status,
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
