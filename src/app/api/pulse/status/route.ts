import { NextResponse } from "next/server";
import { isInFrederickCountyArea } from "@/lib/geo";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import { selectPulseStatus } from "@/lib/live/currentSituationModel";
import { getRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligence";
import type {
  RoadAttentionSignal,
  RoadIntelligenceSnapshot,
} from "@/lib/live/roadIntelligenceModel";
import { getOfficialCivicAlertsSnapshot } from "@/lib/live/officialSignals";
import { isLocallyRelevantCivicAlert } from "@/lib/integrations/official-alert-feeds";

/**
 * /api/pulse/status — lightweight summary of /pulse content for
 * the header indicator. Returns the minimum payload needed to
 * decide whether to show a "something's up" dot, and what tone
 * to paint it.
 *
 * Pulls NWS alerts, FCPS notices, MD traffic incidents, electric outages,
 * privacy-filtered PulsePoint calls, AirNow observations, MDOT road signals,
 * and official civic alerts, then reduces them to:
 *   - active: boolean — anything worth showing?
 *   - count:  number  — total active items across all feeds
 *   - tone:   "alert" (weather/severe-incident grade, a road emergency, or
 *             a city emergency), "caution" (school, elevated air, or any
 *             other road signal), or "quiet" (none)
 *
 * Cached 5 min via Next's revalidate so a polled header indicator
 * doesn't hammer the source feeds. The /pulse page itself uses
 * the same underlying calls with their own cache windows, so the
 * data is consistent across surfaces.
 */
export const revalidate = 300;

/**
 * Road signals the header may count. CHART's message-sign feed is statewide,
 * and on Oct 6 a Howard County sign ("ROADWORK AT EXIT 76 MD 97 2 LEFT LANES
 * CLOSED") lit every page header. A sign carries its physical position, so a
 * sign outside the county area is not a county signal. A sign inside the
 * county can still describe a road past the line; its text is not parsed here.
 */
function countyRoadSignals(
  road: RoadIntelligenceSnapshot | null,
): RoadAttentionSignal[] {
  if (!road) return [];
  const signs = new Map(
    road.sources.messages.data.map((sign) => [`highway-message:${sign.id}`, sign]),
  );
  return road.attention.filter((signal) => {
    if (signal.kind !== "highway-message") return true;
    const sign = signs.get(signal.id);
    return !sign || isInFrederickCountyArea(sign.lng, sign.lat);
  });
}

export async function GET() {
  const [situation, road, civic] = await Promise.all([
    getCurrentSituationSnapshot(),
    getRoadIntelligenceSnapshot().catch(() => null),
    getOfficialCivicAlertsSnapshot().catch(() => null),
  ]);
  const base = selectPulseStatus(situation);
  const localCivicAlerts =
    civic?.alerts.filter(isLocallyRelevantCivicAlert) ?? [];
  const roadSignals = countyRoadSignals(road);
  const count = base.count + roadSignals.length + localCivicAlerts.length;
  // /pulse paints only an emergency road signal (an active snow emergency)
  // as Urgent; closures, pavement reports, and sign messages read there as
  // an Advisory. The header dot must not outrank the page it opens, so
  // road-only evidence stops at caution unless it is an emergency.
  const hasRoadEmergency = roadSignals.some(
    (signal) => signal.severity === "emergency",
  );
  const hasEmergencyCivicSignal = localCivicAlerts.some(
    (alert) => alert.kind === "city-emergency",
  );
  const tone =
    base.tone === "alert" || hasRoadEmergency || hasEmergencyCivicSignal
      ? "alert"
      : count > 0
        ? "caution"
        : "quiet";
  const ok =
    base.ok &&
    road !== null &&
    road.summary.coverage === "complete" &&
    civic !== null &&
    civic.available &&
    !civic.degraded;
  const status = {
    active: count > 0,
    count,
    tone,
    ok,
    lastUpdated: base.lastUpdated,
  };

  return NextResponse.json(
    status,
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
