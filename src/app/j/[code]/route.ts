/**
 * GET /j/<code> — the NFC tap endpoint.
 *
 * A physical card carries https://frederickradius.app/j/<code>. Tapping it opens
 * this URL. We validate the card, assign the tapping DEVICE an anonymous member
 * id attributed to that card, unlock the device past the beta wall the SAME
 * signed way a redeemed per-user code does (a signed fr_beta cookie the edge
 * middleware verifies with pure crypto, no DB hit), and drop them at /today.
 *
 * Security posture (mirrors the public write routes):
 *  - The path is exempt from the beta wall in middleware (isBetaExempt), so the
 *    handler runs while the wall is up and sets the unlock cookie itself.
 *  - The code is validated against the card regex; an unknown, inactive, or
 *    malformed code redirects to /beta with the SAME response as a valid-but-
 *    locked visit, so the endpoint never enumerates which codes exist.
 *  - Per-IP rate limit, reusing the shared limiter.
 *  - FAIL CLOSED: any missing config (no DB, no signing secret) or DB error
 *    redirects to /beta. It never 500s and never silently grants access.
 *  - The member cookie is signed (unforgeable) and httpOnly. The unlock cookie
 *    is set exactly as the existing /api/beta redemption sets it, so the gate is
 *    not weakened: a tapped device passes the wall the same way a code does.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { nfc_cards, nfc_members } from "@/lib/db/schema";
import {
  BETA_COOKIE,
  BETA_ID_COOKIE,
  BETA_TESTER_MARKER,
  BETA_CODE_SESSION_SECONDS,
  signCode,
  signMemberId,
  verifyMemberCookie,
} from "@/lib/beta-gate";
import { MEMBER_COOKIE, MEMBER_COOKIE_MAX_AGE } from "@/lib/nfc-constants";
import { CARD_CODE_RE, newMemberId } from "@/lib/nfc";
import { isRateLimited } from "@/lib/origin-check";

// Needs the Node runtime so it can reach Postgres to validate a card.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every failure path lands here: one generic redirect, no enumeration, no 500. */
function toBeta(req: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL("/beta", req.url));
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = (raw ?? "").toLowerCase();

  // Rate-limit by IP FIRST — before the regex — so a flood of malformed-code
  // probes counts against the same budget as real taps instead of slipping past
  // the limiter on an early return.
  if (await isRateLimited(req, "nfc-tap", 30, 60 * 60)) return toBeta(req);

  if (!CARD_CODE_RE.test(code)) return toBeta(req);

  const db = getDb();
  if (!db) return toBeta(req); // fail closed: no DB means no validation

  try {
    const card = (
      await db
        .select({ code: nfc_cards.code, active: nfc_cards.active })
        .from(nfc_cards)
        .where(eq(nfc_cards.code, code))
        .limit(1)
    )[0];
    // Same response for unknown and inactive: never reveal which codes exist.
    if (!card || card.active !== true) return toBeta(req);

    // Sign the card code into the beta unlock cookie the SAME way redemption
    // does. Null only when no signing secret is configured — fail closed.
    const signedBeta = await signCode(card.code);
    if (!signedBeta) return toBeta(req);

    // Reuse the device's existing signed member id when present, else mint one
    // attributed to this card. The upsert guarantees the row exists so later
    // event inserts never orphan against the foreign key.
    const existing = await verifyMemberCookie(req.cookies.get(MEMBER_COOKIE)?.value);
    const memberId = existing ?? newMemberId();
    if (existing) {
      // Re-tap: bump last_seen_at, but ONLY for members who have not opted out —
      // an opted-out device still gets unlocked (it tapped a physical card and
      // wants in), yet leaves no fresh activity trace, honoring the opt-out.
      await db
        .insert(nfc_members)
        .values({ id: memberId, card_code: card.code })
        .onConflictDoUpdate({
          target: nfc_members.id,
          set: { last_seen_at: new Date() },
          setWhere: eq(nfc_members.opted_out, false),
        });
    } else {
      await db.insert(nfc_members).values({ id: memberId, card_code: card.code });
    }

    const signedMember = await signMemberId(memberId);
    if (!signedMember) return toBeta(req);

    const res = NextResponse.redirect(new URL("/today", req.url));
    res.headers.set("Cache-Control", "no-store");
    // Beta unlock — identical shape and lifetime to a redeemed per-user code.
    res.cookies.set(BETA_COOKIE, signedBeta, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: BETA_CODE_SESSION_SECONDS,
    });
    // Coarse readable marker so in-app beta affordances render (never a credential).
    res.cookies.set(BETA_ID_COOKIE, BETA_TESTER_MARKER, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: BETA_CODE_SESSION_SECONDS,
    });
    // Anonymous member identity — signed, httpOnly, ~1 year. The middleware also
    // treats a valid fr_member as beta access, so the device stays in for the
    // life of this cookie, not just the 12h fr_beta unlock above.
    res.cookies.set(MEMBER_COOKIE, signedMember, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: MEMBER_COOKIE_MAX_AGE,
    });
    return res;
  } catch {
    return toBeta(req); // fail closed on any DB error
  }
}
