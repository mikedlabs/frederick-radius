import { NextResponse } from "next/server";
import { getCurrentSituationSnapshot } from "@/lib/live/currentSituation";
import { selectPulseStatus } from "@/lib/live/currentSituationModel";
import { getRoadIntelligenceSnapshot } from "@/lib/live/roadIntelligence";
import { getOfficialCivicAlertsSnapshot } from "@/lib/live/officialSignals";
import { isLocallyRelevantCivicAlert } from "@/lib/integrations/official-alert-feeds";

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
  const [situation, road, civic] = await Promise.all([
    getCurrentSituationSnapshot(),
    getRoadIntelligenceSnapshot().catch(() => null),
    getOfficialCivicAlertsSnapshot().catch(() => null),
  ]);
  const base = selectPulseStatus(situation);
  const localCivicAlerts =
    civic?.alerts.filter(isLocallyRelevantCivicAlert) ?? [];
  const roadCount = road?.summary.activeCount ?? 0;
  const count = base.count + roadCount + localCivicAlerts.length;
  const hasUrgentRoadSignal = Boolean(
    road?.attention.some(
      (signal) =>
        signal.severity === "warning" || signal.severity === "emergency",
    ),
  );
  const hasEmergencyCivicSignal = localCivicAlerts.some(
    (alert) => alert.kind === "city-emergency",
  );
  const tone =
    base.tone === "alert" || hasUrgentRoadSignal || hasEmergencyCivicSignal
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
