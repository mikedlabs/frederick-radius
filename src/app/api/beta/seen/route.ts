/**
 * POST /api/beta/seen — refresh the current tester's last-seen timestamp.
 *
 * Fired once per session by the client (BetaTelemetry). Identity comes from the
 * httpOnly credential cookie, NOT the request body, so it can only ever bump the
 * caller's own row: we verify the signed code cookie and recover the code from
 * it. Fail-soft + rate-limited — this is best-effort admin telemetry, never on
 * the product's critical path.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_codes } from "@/lib/db/schema";
import { BETA_COOKIE, verifyCodeCookie } from "@/lib/beta-gate";
import { isRateLimited } from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  if (await isRateLimited(req, "beta-seen", 30, 3600)) {
    return NextResponse.json({ ok: false }, { status: 429, headers: noStore });
  }
  const code = await verifyCodeCookie(req.cookies.get(BETA_COOKIE)?.value);
  if (!code) return NextResponse.json({ ok: false }, { headers: noStore });

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false }, { headers: noStore });
  try {
    await db
      .update(beta_codes)
      .set({ last_seen_at: new Date() })
      .where(eq(beta_codes.code, code));
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ ok: false }, { headers: noStore });
  }
}
