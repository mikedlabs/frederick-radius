/**
 * Golden-hour cron — a heads-up push ~30 minutes before the county's best
 * light, to subscribers on the `golden-hour` topic.
 *
 * Ticks every 15 minutes across the possible evening range (vercel.json);
 * the pure gate in lib/golden-push decides whether THIS tick is the one
 * (15-40 minutes before golden start, per real NOAA sun math), and
 * push_log's (topic, dedupe key) claim caps the day at exactly one send
 * regardless of how many ticks qualify. Skips cleanly without VAPID.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { goldenPushDecision } from "@/lib/golden-push";
import { fanoutToTopic } from "@/lib/push-fanout";
import { configurePush } from "@/lib/push";
import { GOLDEN_HOUR_TOPIC } from "@/lib/push-topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (!configurePush()) {
    return NextResponse.json({ ok: true, skipped: "VAPID not configured" });
  }

  const decision = goldenPushDecision(new Date());
  if (!decision.send) {
    return NextResponse.json({ ok: true, skipped: decision.reason });
  }

  const result = await fanoutToTopic(GOLDEN_HOUR_TOPIC, decision.dedupeKey, {
    title: decision.title,
    body: decision.body,
    url: decision.url,
  });
  return NextResponse.json({ ok: true, ...result });
}
