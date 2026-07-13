/**
 * /api/feedback — beta feedback intake.
 *
 *   POST { message, email?, pathname?, version? }
 *
 * Writes to the existing `submissions` table with kind="feedback" (the same
 * intake queue place/event/claim submissions use), so /admin already has a
 * place to read it and no new migration is required.
 *
 * Fail-soft like /api/beta/email: a missing or unmigrated DB never turns a
 * tester's note into a hard error — it degrades to a server log and STILL
 * returns ok, because a lost beta note is worse than a logged one. Rate-limited
 * per IP; empty-guarded + length-capped in parseFeedback so the open endpoint
 * can't be used to bulk-insert junk.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import { isRateLimited } from "@/lib/origin-check";
import { parseFeedback, buildFeedbackRow } from "@/lib/feedback";
import { fanoutToTopic } from "@/lib/push-fanout";
import { OWNER_ALERTS_TOPIC } from "@/lib/push-topics";
import { isRuntimeFlagEnabled } from "@/lib/runtime-flags";
import { checkBotId } from "botid/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  if (await isRuntimeFlagEnabled("disableFeedback")) {
    return NextResponse.json({ error: "disabled" }, { status: 503, headers: noStore });
  }
  const verification = await checkBotId();
  if (verification.isBot) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }
  // 12 notes/hour/IP is generous for a real tester, cheap insurance otherwise.
  if (await isRateLimited(req, "feedback", 12, 3600)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: noStore });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }

  const parsed = parseFeedback(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: noStore });
  }

  const row = buildFeedbackRow(parsed.value, process.env.VERCEL_GIT_COMMIT_SHA ?? null);

  const db = getDb();
  if (db) {
    try {
      const inserted = await db
        .insert(submissions)
        .values(row)
        .returning({ id: submissions.id });
      // Owner alert: the note is on your phone the moment a tester sends it.
      // Fire-and-forget shape — a push failure must never fail the intake.
      const id = inserted[0]?.id;
      if (id) {
        try {
          const where = parsed.value.pathname ? ` · ${parsed.value.pathname}` : "";
          await fanoutToTopic(OWNER_ALERTS_TOPIC, `feedback:${id}`, {
            title: "Beta feedback",
            body: parsed.value.message.slice(0, 140) + where,
            url: "/admin/beta",
          });
        } catch (err) {
          console.error(
            "[feedback] owner alert failed:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    } catch (err) {
      // Table not migrated yet, or a transient DB blip — never lose the note.
      // The log line IS the fallback sink; the endpoint still succeeds.
      console.error(
        "[feedback] DB write failed, kept log fallback:",
        err instanceof Error ? err.message : err,
      );
      console.info("[feedback:fallback]", JSON.stringify(row.payload));
    }
  } else {
    // No DATABASE_URL configured (local dev / preview) — the log is the sink.
    console.info("[feedback:log]", JSON.stringify(row.payload));
  }

  return NextResponse.json({ ok: true }, { headers: noStore });
}
