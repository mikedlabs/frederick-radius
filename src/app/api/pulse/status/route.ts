import { NextResponse } from "next/server";
import { getNwsAlerts } from "@/lib/integrations/nws-alerts";
import { getFcpsAlerts } from "@/lib/integrations/fcps";
import { getChartIncidentsFrederick } from "@/lib/integrations/mdot-chart";
import { getFrederickOutages } from "@/lib/integrations/firstenergy";

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
  // returned nothing. A failed feed makes a zero count untrustworthy: we must
  // not let a provider outage read as "all clear" (audit FR-002). Each catch
  // flips `degraded` and falls back to an empty result so the others still show.
  let degraded = false;
  const fail = <T>(fallback: T) => (): T => {
    degraded = true;
    return fallback;
  };
  const [alerts, fcps, traffic, outages] = await Promise.all([
    getNwsAlerts().catch(fail([] as Awaited<ReturnType<typeof getNwsAlerts>>)),
    getFcpsAlerts().catch(fail([] as Awaited<ReturnType<typeof getFcpsAlerts>>)),
    getChartIncidentsFrederick().catch(fail([] as Awaited<ReturnType<typeof getChartIncidentsFrederick>>)),
    getFrederickOutages().catch(fail({ total_out: 0, total_served: 0, munis: [] } as Awaited<ReturnType<typeof getFrederickOutages>>)),
  ]);

  const now = Date.now();
  const activeAlerts = alerts.filter(
    (a) => !a.ends_at || Date.parse(a.ends_at) > now,
  );
  const schoolAlerts = fcps.filter((a) => a.status !== "unknown");
  const outagesActive = outages.total_out >= 25;

  // "alert" if anything weather-grade is up (NWS alerts) or if power
  // outages crossed the 25-customer threshold; "caution" for the
  // lower-severity school + traffic signals on their own; "quiet"
  // when nothing's active.
  let tone: "alert" | "caution" | "quiet" = "quiet";
  if (activeAlerts.length > 0 || outagesActive) tone = "alert";
  else if (schoolAlerts.length > 0 || traffic.length > 0) tone = "caution";

  const count =
    activeAlerts.length +
    schoolAlerts.length +
    traffic.length +
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
