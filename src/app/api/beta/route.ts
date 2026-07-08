import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { beta_codes } from "@/lib/db/schema";
import {
  BETA_COOKIE,
  BETA_ID_COOKIE,
  betaToken,
  normalizeCode,
  signCode,
} from "@/lib/beta-gate";

// Needs the Node runtime so it can reach Postgres to validate a per-user code.
export const runtime = "nodejs";

/** Only same-origin app paths are valid redirect targets (no open redirect). */
function safeNext(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/today";
}

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
 *      row (first-seen, use count, last-seen) for the admin list. A companion
 *      non-httpOnly `fr_who` cookie carries the code so client analytics can
 *      attribute events to that tester.
 *
 * On failure we bounce back to /beta with an error flag. 303 so the POST
 * becomes a GET on redirect.
 */
export async function POST(req: NextRequest) {
  const pw = process.env.BETA_PASSWORD;
  const form = await req.formData().catch(() => null);
  // Field is still named `password` for backward compatibility with any cached
  // form markup; it now accepts a code too.
  const submitted = form ? String(form.get("password") ?? "") : "";
  const next = safeNext(form?.get("next"));

  const fail = () => {
    const back = new URL("/beta", req.url);
    back.searchParams.set("error", "1");
    back.searchParams.set("next", next);
    return NextResponse.redirect(back, { status: 303 });
  };

  if (!submitted) return fail();

  // 1. Master password (exact match, unchanged behavior).
  if (pw && submitted === pw) {
    const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
    res.cookies.set(BETA_COOKIE, await betaToken(pw), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
    res.cookies.set(BETA_ID_COOKIE, "owner", {
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
    valid = Boolean(row) && !row.revoked;
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
  res.cookies.set(BETA_COOKIE, signed, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  res.cookies.set(BETA_ID_COOKIE, code, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return res;
}
