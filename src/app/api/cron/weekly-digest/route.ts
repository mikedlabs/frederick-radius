import { NextResponse } from "next/server";
import { buildWeeklyDigestBody } from "@/lib/integrations/weekly-digest";
import { deliverWeeklyDigest } from "@/lib/integrations/github-alerts";
import { verifyCronAuth } from "../../ingest/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Monday-morning business digest: one GitHub issue with the week's
 * traffic and action numbers (src/lib/integrations/weekly-digest.ts).
 * Rides the same delivery channel as the nightly health alerts.
 *
 * Guarded by CRON_SECRET like every sibling cron: because delivery opens a
 * GitHub issue, an unauthenticated GET could otherwise spam the repo. Once
 * past the guard it stays fail-soft, always answering 200 with a missing
 * token or key reported in the payload rather than thrown.
 */
export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  const now = new Date();
  const body = await buildWeeklyDigestBody(now);
  const delivery = await deliverWeeklyDigest(body, now);
  return NextResponse.json({ ok: true, delivery });
}
