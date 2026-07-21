/**
 * Traffic-alerts fanout cron.
 *
 * Pushes a notification when a BIG accident closes a main road — the same
 * bar the /today "Heads up" card already uses (qualifiesForToday: High
 * severity, an Incident/Weather type, a major route, started within 12h,
 * not already cleared). Reusing that one classifier is deliberate: the
 * push and the on-page card can never disagree about what counts as big.
 *
 * A typical day pushes nothing; only an I-70-closed / fatal-crash-class
 * event fires. Dedupe is by a key that survives CHART's row-id churn
 * (road + direction + start time), so the same physical crash never
 * double-pushes even when CHART republishes it under a new id.
 *
 * Schedule (vercel.json): every 10 minutes. Not marked urgent — a road
 * closure can wait for a subscriber's quiet hours to lift, unlike an NWS
 * flash-flood warning. Auth: same CRON_SECRET bearer as the other crons.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import {
  getChartIncidentsFrederick,
  dedupeChartIncidents,
  qualifiesForToday,
  chartTodayTitle,
  chartFreshnessTail,
} from "@/lib/integrations/mdot-chart";
import { fanoutToTopic } from "@/lib/push-fanout";
import { configurePush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (!configurePush()) {
    return NextResponse.json({ ok: true, skipped: "VAPID not configured" }, { status: 200 });
  }

  const now = new Date();
  const incidents = dedupeChartIncidents(
    await getChartIncidentsFrederick().catch(() => []),
  );
  const big = incidents.filter((i) => qualifiesForToday(i, now));

  const results: Array<{
    road: string;
    claimed: boolean;
    sent: number;
    gone: number;
  }> = [];

  for (const i of big) {
    // Stable across CHART's row-id churn: the same physical crash keeps its
    // road + direction + start time even when the feed reassigns the id.
    const dedupeKey = `${i.road}|${i.direction ?? ""}|${i.started_at}`;
    const r = await fanoutToTopic(
      "traffic-alerts",
      dedupeKey,
      {
        title: chartTodayTitle(i),
        body: `${chartFreshnessTail(i, now)}. Expect delays.`,
        url: "/pulse?open=traffic",
        tag: `traffic:${dedupeKey}`,
      },
      { urgent: false },
    );
    results.push({ road: i.road, claimed: r.claimed, sent: r.sent, gone: r.gone });
  }

  return NextResponse.json({
    ran_at: now.toISOString(),
    incidents_checked: incidents.length,
    big_accidents: big.length,
    fanouts: results.length,
    detail: results,
  });
}
