import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_codes } from "@/lib/db/schema";
import {
  BETA_COOKIE,
  BETA_ID_COOKIE,
  BETA_OWNER_MARKER,
  BETA_TESTER_MARKER,
  BETA_CODE_SESSION_SECONDS,
  betaToken,
  isRedeemableBetaCode,
  normalizeCode,
  signCode,
} from "@/lib/beta-gate";
import { safeRedirectPath } from "@/lib/safe-redirect";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readTextBodyWithLimit,
} from "@/lib/origin-check";

// Needs the Node runtime so it can reach Postgres to validate a per-user code.
export const runtime = "nodejs";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * POST /api/beta — the beta unlock action. One text field accepts EITHER a
 * per-user access code OR the shared master password:
 *
 *   1. Master password (BETA_PASSWORD) — the owner key. Sets the httpOnly
 *      SHA token cookie the middleware has always checked; identity = "owner".
 *   2. Per-user code — looked up in beta_codes (must exist, not be revoked).
 *      On success we mint a SIGNED cookie that embeds the code, so the edge
 *      middleware can verify it without a DB hit, and stamp redemption on the
 *      row (first-seen, use count, last-seen) for beta access management. A
 *      companion non-httpOnly `fr_who` cookie carries only a coarse tester
 *      marker for beta-only client UI; the personal code stays out of
 *      browser-readable telemetry.
 *
 * On failure we bounce back to /beta with an error flag. 303 so the POST
 * becomes a GET on redirect.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  // Access codes are short. This ceiling stops oversized parser work, while
  // the low attempt budget makes online guessing of even legacy short codes
  // impractical. A distributed KV limit is used when configured, with the
  // bounded per-instance fallback otherwise.
  if (await isRateLimited(req, "beta-unlock", 10, 15 * 60)) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "900", "Cache-Control": "no-store" },
    });
  }

  const pw = process.env.BETA_PASSWORD;
  const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/x-www-form-urlencoded") {
    return new Response("Unsupported Media Type", {
      status: 415,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const body = await readTextBodyWithLimit(req, 4 * 1024);
  if (!body.ok) {
    return new Response(body.error === "body-too-large" ? "Payload Too Large" : "Bad Request", {
      status: body.error === "body-too-large" ? 413 : 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const form = new URLSearchParams(body.value);
  // Field is still named `password` for backward compatibility with any cached
  // form markup; it now accepts a code too.
  const submitted = String(form.get("password") ?? "").slice(0, 256);
  const next = safeRedirectPath(form.get("next"), "/today");

  const fail = () => {
    const back = new URL("/beta", req.url);
    back.searchParams.set("error", "1");
    back.searchParams.set("next", next);
    const response = NextResponse.redirect(back, { status: 303 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  if (!submitted) return fail();

  // 1. Master password (exact match, unchanged behavior).
  if (pw && submitted === pw) {
    const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
    res.headers.set("Cache-Control", "no-store");
    res.cookies.set(BETA_COOKIE, await betaToken(pw), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
    res.cookies.set(BETA_ID_COOKIE, BETA_OWNER_MARKER, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
    return res;
  }

  // 2. Per-user access code.
  const code = normalizeCode(submitted);
  const signed = code ? await signCode(code) : null;
  if (!code || !signed) return fail();

  const db = getDb();
  if (!db) return fail(); // codes require the DB; no silent open door

  let valid = false;
  try {
    const row = (
      await db
        .select({ revoked: beta_codes.revoked })
        .from(beta_codes)
        .where(eq(beta_codes.code, code))
        .limit(1)
    )[0];
    valid = isRedeemableBetaCode(row);
    if (valid) {
      // Stamp redemption: first-seen once, bump use count + last-seen always.
      await db
        .update(beta_codes)
        .set({
          uses: sql`${beta_codes.uses} + 1`,
          last_seen_at: new Date(),
          redeemed_at: sql`coalesce(${beta_codes.redeemed_at}, now())`,
        })
        .where(eq(beta_codes.code, code));
    }
  } catch {
    // Table not migrated / transient DB error — treat as invalid (fail closed).
    return fail();
  }

  if (!valid) return fail();

  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(BETA_COOKIE, signed, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: BETA_CODE_SESSION_SECONDS,
  });
  res.cookies.set(BETA_ID_COOKIE, BETA_TESTER_MARKER, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: BETA_CODE_SESSION_SECONDS,
  });
  return res;
}
