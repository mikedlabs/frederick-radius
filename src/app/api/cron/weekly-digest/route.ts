import { NextResponse } from "next/server";
import { buildWeeklyDigestBody } from "@/lib/integrations/weekly-digest";
import { deliverWeeklyDigest } from "@/lib/integrations/github-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Monday-morning business digest: one GitHub issue with the week's
 * traffic and action numbers (src/lib/integrations/weekly-digest.ts).
 * Rides the same delivery channel as the nightly health alerts.
 * Fail-soft: the cron always answers 200; a missing token or key is
 * reported in the payload, never thrown.
 */
export async function GET() {
  const now = new Date();
  const body = await buildWeeklyDigestBody(now);
  const delivery = await deliverWeeklyDigest(body, now);
  return NextResponse.json({ ok: true, delivery });
}
