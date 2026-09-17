/**
 * /api/feedback — visitor feedback intake.
 *
 *   POST { message, email?, pathname?, version? }
 *   POST { message, pathname: FairDay, fairIssue, fairContext?, email? }
 *   POST { source: "ask-correction", reason, resultRef?, pathname? }
 *
 * Writes to the existing `submissions` table with kind="feedback" (the same
 * intake queue place/event/claim submissions use), so /admin already has a
 * place to read it and no new migration is required.
 *
 * A receipt is only returned after the note is durably stored. If storage is
 * unavailable, the client gets a retryable response and keeps the visitor's
 * draft. Operational logs never include the note or optional email.
 *
 * Owner push is deliberately a second, best-effort step. A push failure is
 * recorded without visitor content and never rolls back a stored report.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { submissions } from "@/lib/db/schema";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";
import {
  buildFeedbackOwnerAlert,
  buildFeedbackRow,
  parseFeedback,
} from "@/lib/feedback";
import { fanoutToTopic } from "@/lib/push-fanout";
import { OWNER_ALERTS_TOPIC } from "@/lib/push-topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const MAX_FEEDBACK_BODY_BYTES = 32 * 1024;
const storageUnavailableHeaders = {
  ...noStore,
  "Retry-After": "30",
};

function storageUnavailableResponse() {
  return NextResponse.json(
    { ok: false, error: "feedback-storage-unavailable" },
    { status: 503, headers: storageUnavailableHeaders },
  );
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore });
  }
  // 12 notes/hour/IP is generous for a real tester, cheap insurance otherwise.
  if (await isRateLimited(req, "feedback", 12, 3600)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: noStore });
  }

  const body = await readJsonBodyWithLimit(req, MAX_FEEDBACK_BODY_BYTES);
  if (!body.ok) {
    return NextResponse.json(
      { error: body.error },
      { status: body.error === "body-too-large" ? 413 : 400, headers: noStore },
    );
  }

  const parsed = parseFeedback(body.value);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: noStore });
  }

  const row = buildFeedbackRow(parsed.value, process.env.VERCEL_GIT_COMMIT_SHA ?? null);

  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch {
    console.error("[feedback] durable storage unavailable", {
      stage: "initialization",
    });
    return storageUnavailableResponse();
  }
  if (!db) {
    console.error("[feedback] durable storage unavailable", {
      stage: "configuration",
    });
    return storageUnavailableResponse();
  }

  let id: string | undefined;
  try {
    const inserted = await db
      .insert(submissions)
      .values(row)
      .returning({ id: submissions.id });
    id = inserted[0]?.id;
  } catch {
    // Do not log the thrown DB error. Driver errors can include bound values,
    // which would expose the visitor's note or optional email.
    console.error("[feedback] durable storage failed", { stage: "insert" });
    return storageUnavailableResponse();
  }

  // Owner alert: the note is on the owner's phone when push is configured.
  // The submission is already durable, so alert trouble is observable but
  // cannot turn a saved report into a visitor-facing failure.
  if (id) {
    try {
      const alert = buildFeedbackOwnerAlert(parsed.value);
      const delivery = await fanoutToTopic(
        OWNER_ALERTS_TOPIC,
        `feedback:${id}`,
        {
          title: alert.title,
          body: alert.body,
          url: "/admin/beta",
        },
      );
      if (!delivery.claimed || delivery.sent === 0) {
        console.warn("[feedback] owner alert not delivered", {
          submissionId: id,
          claimed: delivery.claimed,
          attempted: delivery.attempted,
          sent: delivery.sent,
          gone: delivery.gone,
          held: delivery.held,
        });
      }
    } catch {
      console.error("[feedback] owner alert failed", {
        submissionId: id,
        stage: "fanout",
      });
    }
  } else {
    console.warn("[feedback] owner alert skipped", {
      reason: "missing-submission-id",
    });
  }

  return NextResponse.json({ ok: true }, { headers: noStore });
}
