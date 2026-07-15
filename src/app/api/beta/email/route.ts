/**
 * /api/beta/email — personal-access-code request from the beta wall.
 *
 *   POST { email }
 *
 * Unauthenticated (it lives OUTSIDE the wall by definition) + fail-soft like
 * /api/commerce/report-link: if the table isn't migrated or the DB is absent
 * it degrades to ok:false so the UI can apologize without a hard error.
 * Rate-limited per IP so the open endpoint can't be used to bulk-insert junk.
 * Duplicate emails keep their one signup row, but still retry invite delivery:
 * inviteEmail reuses the existing active personal code instead of minting a
 * different one.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { beta_emails } from "@/lib/db/schema";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";
import { fanoutToTopic } from "@/lib/push-fanout";
import { OWNER_ALERTS_TOPIC } from "@/lib/push-topics";
import { inviteEmail } from "@/lib/beta-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const MAX_BETA_EMAIL_BODY_BYTES = 4 * 1024;

// Deliberately simple: catches typos ("a@b", no TLD) without rejecting valid
// unusual addresses. The unique index is the real dedupe.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore });
  }
  if (await isRateLimited(req, "beta-email", 5, 3600)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: noStore });
  }
  const rawBody = await readJsonBodyWithLimit(req, MAX_BETA_EMAIL_BODY_BYTES);
  if (!rawBody.ok) {
    return NextResponse.json(
      { error: rawBody.error },
      { status: rawBody.error === "body-too-large" ? 413 : 400, headers: noStore },
    );
  }
  const body =
    typeof rawBody.value === "object" && rawBody.value !== null && !Array.isArray(rawBody.value)
      ? (rawBody.value as { email?: unknown })
      : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid-email" }, { status: 400, headers: noStore });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { ok: false, sent: false, stored: false, db: false },
      { headers: noStore },
    );
  }
  try {
    const inserted = await db
      .insert(beta_emails)
      .values({ email })
      .onConflictDoNothing()
      .returning({ id: beta_emails.id });
    // Always try delivery, including on a duplicate request. mintCodeForEmail
    // reuses the existing non-revoked code, which makes a retry useful after a
    // transient Resend/configuration failure without creating a second signup.
    const invite = await inviteEmail(email);
    // Owner alert on genuinely NEW signups only (a duplicate signup inserts
    // nothing and stays silent). Push failure never fails the signup.
    const id = inserted[0]?.id;
    if (id) {
      try {
        await fanoutToTopic(OWNER_ALERTS_TOPIC, `signup:${id}`, {
          title: "New beta signup",
          body: `${email} · ${invite.sent ? "code emailed" : invite.code ? "code minted, email not delivered" : "code mint failed"}`,
          url: "/admin/beta",
        });
      } catch (err) {
        console.error(
          "[beta/email] owner alert failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    // `stored` describes the fail-soft signup retention; `sent` (and therefore
    // `ok`) is true only when Resend accepted the invite. The client must never
    // turn a stored-but-unsent request into a "Sent" confirmation.
    return NextResponse.json(
      { ok: invite.sent, sent: invite.sent, stored: true },
      { headers: noStore },
    );
  } catch {
    // Table not migrated yet, or transient DB failure — benign degrade.
    return NextResponse.json(
      { ok: false, sent: false, stored: false },
      { headers: noStore },
    );
  }
}
