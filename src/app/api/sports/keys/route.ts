import { NextResponse } from "next/server";
import { getKeysScoreToday } from "@/lib/integrations/keysScore";

/**
 * GET /api/sports/keys
 *
 * Today's Frederick Keys game score (home OR away), for the live score card on
 * /today. Returns `{ game: KeysScore | null }`. Fails soft to `{ game: null }`
 * so the client card simply self-hides on any upstream trouble.
 *
 * Cached short at the edge (s-maxage=30, SWR=60): a live inning is never more
 * than ~30s stale, and the edge collapses the poll traffic from every open
 * /today into one upstream call per 30s. The client polls this only while a
 * game is live (see KeysScore.tsx).
 */
// A score is a runtime fact, not release data. Keeping this route dynamic
// prevents `next build` from turning an upstream score request into a deploy
// dependency; the response and normalized upstream result retain their own
// 30-second caches below.
export const dynamic = "force-dynamic";

export async function GET() {
  const game = await getKeysScoreToday(new Date()).catch(() => null);
  return NextResponse.json(
    { game },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
