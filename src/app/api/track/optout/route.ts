/**
 * POST /api/track/optout — a member opts OUT of (or back into) first-party
 * activity logging.
 *
 * Identity comes from the signed httpOnly `fr_member` cookie, so this only ever
 * flips the caller's own row. The CLIENT is the primary source of truth for
 * stopping posts (an fr_analytics_optout cookie/localStorage the tracker checks
 * before every post); this route makes the choice stick server-side too, so any
 * event that still arrives from a stale cookie is dropped. Same-origin and
 * rate-limited; fails soft (204) so the privacy toggle never shows an error.
 *
 * Body: { optout?: boolean }. Defaults to true (opt out); { optout: false }
 * opts back in.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { nfc_members } from "@/lib/db/schema";
import { verifyMemberCookie } from "@/lib/beta-gate";
import { MEMBER_COOKIE } from "@/lib/nfc-constants";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore });
  }
  if (await isRateLimited(req, "track-optout", 20, 60 * 60)) {
    return NextResponse.json(
      { error: "rate-limited" },
      { status: 429, headers: { ...noStore, "Retry-After": "3600" } },
    );
  }

  // Default to opting OUT; an explicit { optout: false } opts back in.
  let optOut = true;
  const rawBody = await readJsonBodyWithLimit(req, 1024);
  if (rawBody.ok && typeof rawBody.value === "object" && rawBody.value !== null && !Array.isArray(rawBody.value)) {
    const flag = (rawBody.value as Record<string, unknown>).optout;
    if (typeof flag === "boolean") optOut = flag;
  }

  // No member cookie: the client-side opt-out is enough; nothing to persist.
  const memberId = await verifyMemberCookie(req.cookies.get(MEMBER_COOKIE)?.value);
  if (!memberId) return noContent();

  // A member exists, so the choice MUST persist server-side — that persisted
  // flag is what drops events arriving from a stale cookie the client can't
  // clear. Unlike the analytics INGEST (which fails soft — a lost event is
  // harmless), a privacy control must FAIL CLOSED: if we can't record the
  // opt-out, we say so (503) so the client can surface it and retry, rather
  // than 204-ing a success the database never saw.
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore });
  }
  try {
    await db.update(nfc_members).set({ opted_out: optOut }).where(eq(nfc_members.id, memberId));
  } catch {
    return NextResponse.json({ error: "not-persisted" }, { status: 503, headers: noStore });
  }
  return noContent();
}
