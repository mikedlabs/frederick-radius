import { NextResponse } from "next/server";
import { getNwsAlertsResult } from "@/lib/integrations/nws-alerts";
import { getFcpsAlertsResult } from "@/lib/integrations/fcps";
import { getChartIncidentsFrederickResult } from "@/lib/integrations/mdot-chart";
import { getFrederickOutagesResult } from "@/lib/integrations/firstenergy";

/**
 * /api/pulse/status — lightweight summary of /pulse content for
 * the header indicator. Returns the minimum payload needed to
 * decide whether to show a "something's up" dot, and what tone
 * to paint it.
 *
 * Pulls four feeds (NWS alerts, FCPS school alerts, MD traffic
 * incidents, electric outages) and reduces them to:
 *   - active: boolean — anything worth showing?
 *   - count:  number  — total active items across all feeds
 *   - tone:   "alert" (weather/incident-grade), "caution"
 *             (school/traffic-only), or "quiet" (none)
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
  const [alertResult, fcpsResult, trafficResult, outageResult] = await Promise.all([
    getNwsAlertsResult().catch(() => ({ alerts: [], available: false })),
    getFcpsAlertsResult().catch(() => ({ data: [], available: false })),
    getChartIncidentsFrederickResult().catch(() => ({ data: [], available: false })),
    getFrederickOutagesResult().catch(() => ({
      data: { total_out: 0, total_served: 0, munis: [] },
      available: false,
    })),
  ]);

  const degraded = !alertResult.available || !fcpsResult.available || !trafficResult.available || !outageResult.available;
  const alerts = alertResult.alerts;
  const fcps = fcpsResult.data;
  const traffic = trafficResult.data;
  const outages = outageResult.data;

  const now = Date.now();
  const activeAlerts = alerts.filter(
    (a) => !a.ends_at || Date.parse(a.ends_at) > now,
  );
  const schoolAlerts = fcps.filter(
    (alert) => alert.status === "closed" || alert.status === "delayed" || alert.status === "early_dismissal",
  );
  const highTraffic = traffic.filter((incident) => incident.severity === "High");
  const outagesActive = outages.total_out >= 25;

  // "alert" if anything weather-grade is up (NWS alerts) or if power
  // outages crossed the 25-customer threshold, or a High-severity road event
  // is live; "caution" for school schedule changes; "quiet" otherwise.
  let tone: "alert" | "caution" | "quiet" = "quiet";
  if (activeAlerts.length > 0 || outagesActive || highTraffic.length > 0) tone = "alert";
  else if (schoolAlerts.length > 0) tone = "caution";

  const count =
    activeAlerts.length +
    schoolAlerts.length +
    highTraffic.length +
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
