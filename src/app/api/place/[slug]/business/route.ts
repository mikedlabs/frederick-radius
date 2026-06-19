import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { follows, place_claims } from "@/lib/db/schema";

/**
 * GET /api/place/<slug>/business — the public follow context for a place.
 *
 *   → { claimed: boolean, followers: number }
 *
 * `claimed`   true when an ACTIVE place_claims row exists — a verified owner
 *             is behind the place, so following it means real updates can
 *             reach you (the publish side of the follow->reach loop).
 * `followers` how many people follow the place. Powers the calm social-proof
 *             line ("42 locals follow this") and lets the follow CTA reframe
 *             a generic Save into "Follow" for a business that can speak back.
 *
 * Public + unauthenticated: this is non-sensitive aggregate signal the place
 * page reads to decide how to present the follow button. Degrades to the
 * neutral shape when the DB isn't configured for the deployment, so the
 * button simply falls back to its generic Save framing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore() {
  return { "Cache-Control": "no-store" };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return NextResponse.json({ claimed: false, followers: 0 }, { headers: noStore() });
  }

  try {
    const [claimRow, countRow] = await Promise.all([
      db
        .select({ id: place_claims.id })
        .from(place_claims)
        .where(and(eq(place_claims.place_slug, slug), eq(place_claims.status, "active")))
        .limit(1),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(follows)
        .where(eq(follows.place_slug, slug)),
    ]);
    return NextResponse.json(
      { claimed: claimRow.length > 0, followers: countRow[0]?.n ?? 0 },
      { headers: noStore() },
    );
  } catch {
    // A read failure must never break the place page — fall back to neutral.
    return NextResponse.json({ claimed: false, followers: 0 }, { headers: noStore() });
  }
}
