import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string compare (cqb-2). A plain `a !== b` short-circuits on the
 * first differing byte, leaking — across many requests — how much of a guessed
 * bearer token is correct. timingSafeEqual compares in time independent of
 * content. The length guard before it can leak only the token LENGTH (which is
 * not secret, and is unavoidable since timingSafeEqual throws on unequal-length
 * buffers).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (!header || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
