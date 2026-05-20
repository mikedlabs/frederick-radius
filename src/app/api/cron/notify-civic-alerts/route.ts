/**
 * Civic-alerts fanout cron.
 *
 * Pulls the active NWS + NPS alert set for Frederick County and fans
 * out a push notification for every new one to subscribers opted into
 * the "civic-alerts" topic. Dedupe is by alert ID via push_log so the
 * same alert never sends twice — even across cron runs and worker
 * boundaries.
 *
 * Schedule (vercel.json): every 30 minutes. NWS itself updates faster
 * than that on a severe-weather event, but the user-perceived latency
 * is acceptable for the broad alert tier and the cost stays trivial
 * (a few HTTP calls + ~one DB INSERT … DO NOTHING per alert).
 *
 * Auth: same CRON_SECRET bearer as the other cron paths.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { getNwsAlerts } from "@/lib/integrations/nws-alerts";
import { fanoutToTopic } from "@/lib/push-fanout";
import { configurePush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (!configurePush()) {
    return NextResponse.json(
      {
        ok: true,
        skipped: "VAPID not configured",
      },
      { status: 200 },
    );
  }

  const alerts = await getNwsAlerts().catch(() => []);
  const results: Array<{
    id: string;
    event: string;
    claimed: boolean;
    sent: number;
    gone: number;
  }> = [];

  for (const a of alerts) {
    // Filter to actionable severity — we don't push every Minor
    // advisory. Editor can widen this set later by topic preference.
    const actionable =
      a.severity === "Severe" ||
      a.severity === "Extreme" ||
      a.urgency === "Immediate";
    if (!actionable) continue;

    const r = await fanoutToTopic("civic-alerts", a.id, {
      title: a.event,
      body: a.headline,
      url: "/pulse",
      tag: `nws:${a.id}`,
    });

    results.push({
      id: a.id,
      event: a.event,
      claimed: r.claimed,
      sent: r.sent,
      gone: r.gone,
    });
  }

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    alerts_checked: alerts.length,
    fanouts: results.length,
    detail: results,
  });
}
