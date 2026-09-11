/**
 * /api/cron/first-saturday — a mid-afternoon "First Saturday is today" nudge on
 * the first Saturday of each month (downtown Frederick's galleries + shops stay
 * open late). Reuses the existing computable seasonal note as the single source
 * of truth for both the "is it today?" calendar logic AND the copy, so the push
 * can never drift from what the app already shows.
 *
 * SHIPS OFF: no-ops until the owner sets FIRST_SATURDAY_ENABLED=1 in Vercel.
 * Sends through fanoutToTopic (quiet hours honored, one send per month via the
 * dedupe key). Auth: the same CRON_SECRET bearer as every other cron path.
 */
import { NextResponse } from "next/server";
import { verifyCronAuth } from "../../ingest/_auth";
import { fanoutToTopic } from "@/lib/push-fanout";
import { configurePush } from "@/lib/push";
import { SEASONAL_NOTES } from "@/lib/seasonal-notes";
import { frederickHour } from "@/lib/search-suggestions";
import { easternParts } from "@/lib/tz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = verifyCronAuth(request);
  if (auth) return auth;

  if (process.env.FIRST_SATURDAY_ENABLED !== "1") {
    return NextResponse.json({ ok: true, skipped: "FIRST_SATURDAY_ENABLED not set" });
  }

  // 3pm-ET gate (the schedule fires at both EST/EDT offsets; the dedupe key
  // collapses to one send per month).
  const hour = frederickHour();
  if (hour !== 15) return NextResponse.json({ ok: true, skipped: `not 3pm ET (is ${hour})` });

  if (!configurePush()) return NextResponse.json({ ok: true, skipped: "VAPID not configured" });

  const now = new Date();
  const note = SEASONAL_NOTES.find((n) => n.id === "first-saturday");
  if (!note || !note.active(now)) {
    return NextResponse.json({ ok: true, skipped: "not first Saturday" });
  }

  const { year, month } = easternParts(now);
  const result = await fanoutToTopic("daily-briefing", `first-sat:${year}-${month}`, {
    title: note.lead,
    body: note.detail,
    url: note.href ?? "/events",
    tag: `first-sat:${year}-${month}`,
  });

  return NextResponse.json({ ran_at: now.toISOString(), month: `${year}-${month}`, ...result });
}
