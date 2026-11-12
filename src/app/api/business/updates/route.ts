import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { business_updates, place_claims } from "@/lib/db/schema";
import { getServerUser } from "@/lib/auth";
import { parsePublishBody, isAdminEmail } from "@/lib/business-updates";
import {
  hasJsonContentType,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

/**
 * POST /api/business/updates — PUBLISH half of the follow -> reach loop.
 *
 * A claimed business (or an admin) posts a verified deal/event/closure and we
 * persist it to business_updates for the "recent updates" rail. Updates used
 * to fan out as a web push to biz:<slug> subscribers; push notifications were
 * retired, so publishing now only stores the update.
 *
 * Authorization (one MUST hold):
 *   - the caller's email is on the ADMIN_EMAILS allowlist, OR
 *   - the caller owns an ACTIVE place_claims row for this slug.
 * Anyone else gets 403. You cannot publish to a business you don't own.
 *
 * Spam guard: at most one published update per place per 12 hours.
 */
export const runtime = "nodejs";

const RATE_WINDOW_MS = 12 * 60 * 60 * 1000;

function noStore() {
  return { "Cache-Control": "no-store" };
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore() });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "content-type" }, { status: 415, headers: noStore() });
  }
  const parsedBody = await readJsonBodyWithLimit(req, 8 * 1_024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.error === "body-too-large" ? 413 : 400, headers: noStore() },
    );
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: noStore() });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
  }

  const parsed = parsePublishBody(parsedBody.value);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: noStore() });
  }
  const { slug, title, body, update_type } = parsed.value;

  // Authorize: admin allowlist OR active claim owner of this slug.
  let authorized = isAdminEmail(user.email, process.env.ADMIN_EMAILS);
  if (!authorized) {
    const claim = await db
      .select({ id: place_claims.id })
      .from(place_claims)
      .where(
        and(
          eq(place_claims.place_slug, slug),
          eq(place_claims.claimed_by_user_id, user.id),
          eq(place_claims.status, "active"),
        ),
      )
      .limit(1);
    authorized = claim.length > 0;
  }
  if (!authorized) {
    return NextResponse.json({ error: "not-authorized" }, { status: 403, headers: noStore() });
  }

  // Spam guard — one published update per place per 12h.
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const recent = await db
    .select({ id: business_updates.id })
    .from(business_updates)
    .where(
      and(
        eq(business_updates.place_slug, slug),
        eq(business_updates.status, "published"),
        gt(business_updates.published_at, since),
      ),
    )
    .limit(1);
  if (recent.length > 0) {
    return NextResponse.json(
      { error: "rate-limited", detail: "One published update per place per 12 hours." },
      { status: 429, headers: noStore() },
    );
  }

  // Persist the published update.
  const inserted = await db
    .insert(business_updates)
    .values({
      place_slug: slug,
      created_by_user_id: user.id,
      title,
      body,
      update_type,
      status: "published",
      published_at: sql`now()`,
    })
    .returning({ id: business_updates.id });
  const id = inserted[0]?.id;
  if (!id) {
    return NextResponse.json({ error: "persist-failed" }, { status: 500, headers: noStore() });
  }

  return NextResponse.json({ ok: true, id }, { headers: noStore() });
}
