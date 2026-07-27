import { NextResponse } from "next/server";
import { getNwsAlertsResult } from "@/lib/integrations/nws-alerts";
import {
  currentFcpsOperationsNotices,
  getFcpsAlertsResult,
} from "@/lib/integrations/fcps";
import { getChartIncidentsFrederickResult } from "@/lib/integrations/mdot-chart";
import { getFrederickOutagesResult } from "@/lib/integrations/firstenergy";
import {
  getPulsePointIncidentsResult,
  isPulsePointAlert,
} from "@/lib/integrations/pulsepoint";
import {
  getAirQuality,
  isFreshAqiObservation,
  pickWorstAqi,
} from "@/lib/integrations/airnow";
import { FREDERICK_CENTER } from "@/lib/geo";

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
  // Track whether any feed FAILED, distinctly from a feed that succeeded and
  // returned nothing. The source integrations report that state explicitly so
  // an upstream 404 or malformed response cannot read as "all clear."
  const [alertResult, fcpsResult, trafficResult, outageResult, safetyResult, aqiResult] = await Promise.all([
    getNwsAlertsResult().catch(() => ({ alerts: [], available: false })),
    getFcpsAlertsResult().catch(() => ({ data: [], available: false })),
    getChartIncidentsFrederickResult().catch(() => ({ data: [], available: false })),
    getFrederickOutagesResult().catch(() => ({
      data: { total_out: 0, total_served: 0, munis: [] },
      available: false,
    })),
    getPulsePointIncidentsResult().catch(() => ({
      data: [],
      available: false,
      configured: true,
    })),
    getAirQuality(FREDERICK_CENTER).catch(() => null),
  ]);

  // PulsePoint is an optional, policy-gated source. When it is deliberately
  // disabled, that is not an outage and must not make the county read
  // "unknown." Once configured, an upstream failure does count.
  const safetyAvailable = !safetyResult.configured || safetyResult.available;
  const freshAqi = (aqiResult ?? []).filter((observation) =>
    isFreshAqiObservation(observation, new Date()),
  );
  const airAvailable = aqiResult !== null && freshAqi.length > 0;
  const degraded =
    !alertResult.available ||
    !fcpsResult.available ||
    !trafficResult.available ||
    !outageResult.available ||
    !safetyAvailable ||
    !airAvailable;
  const alerts = alertResult.alerts;
  const fcps = fcpsResult.data;
  const traffic = trafficResult.data;
  const outages = outageResult.data;
  const safety = safetyResult.data;
  // A PulsePoint dispatch is not automatically a public alert. Routine calls
  // such as lockouts, public assists, and automatic alarms remain visible on
  // /pulse, but only explicitly severe fire/rescue/hazard types belong in the
  // global alert count.
  const safetyAlerts = safety.filter(isPulsePointAlert);
  const aqiWorst = pickWorstAqi(freshAqi);

  const now = Date.now();
  const activeAlerts = alerts.filter(
    (a) => !a.ends_at || Date.parse(a.ends_at) > now,
  );
  const schoolAlerts = currentFcpsOperationsNotices(fcps).filter(
    (alert) => alert.status === "closed" || alert.status === "delayed" || alert.status === "early_dismissal",
  );
  const highTraffic = traffic.filter((incident) => incident.severity === "High");
  const outagesActive = outages.total_out >= 25;
  const aqiActive = Boolean(aqiWorst && aqiWorst.category.id >= 3);

  // "alert" if anything weather-grade is up, power outages crossed the
  // 25-customer threshold, a High-severity road event is live, or PulsePoint
  // carries a clearly severe fire/rescue/hazard type. School schedule changes
  // and elevated-but-not-unhealthy AQI are caution; everything else is quiet.
  let tone: "alert" | "caution" | "quiet" = "quiet";
  if (
    activeAlerts.length > 0 ||
    outagesActive ||
    highTraffic.length > 0 ||
    safetyAlerts.length > 0 ||
    (aqiWorst?.category.id ?? 0) >= 4
  ) tone = "alert";
  else if (schoolAlerts.length > 0 || aqiActive) tone = "caution";

  const count =
    activeAlerts.length +
    schoolAlerts.length +
    highTraffic.length +
    safetyAlerts.length +
    (aqiActive ? 1 : 0) +
    (outagesActive ? 1 : 0);

  return NextResponse.json(
    {
      active: count > 0,
      count,
      tone,
      // `ok:false` means at least one feed failed this fetch, so a zero count
      // is "unknown", not a promise of "all clear". The header reads this.
      ok: !degraded,
      lastUpdated: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
