/**
 * /api/beta/email — optional launch-news signup from the beta wall.
 *
 *   POST { email }
 *
 * Unauthenticated (it lives OUTSIDE the wall by definition) + fail-soft like
 * /api/commerce/report-link: if the table isn't migrated or the DB is absent
 * it degrades to ok:false so the UI can apologize without a hard error.
 * Rate-limited per IP so the open endpoint can't be used to bulk-insert junk;
 * duplicate emails no-op via the unique index (signing up twice reads as
 * success, which is the honest UX).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { beta_emails } from "@/lib/db/schema";
import { isRateLimited } from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

// Deliberately simple: catches typos ("a@b", no TLD) without rejecting valid
// unusual addresses. The unique index is the real dedupe.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  if (await isRateLimited(req, "beta-email", 5, 3600)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: noStore });
  }
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid-email" }, { status: 400, headers: noStore });
  }
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, db: false }, { headers: noStore });
  try {
    await db.insert(beta_emails).values({ email }).onConflictDoNothing();
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    // Table not migrated yet, or transient DB failure — benign degrade.
    return NextResponse.json({ ok: false }, { headers: noStore });
  }
}
