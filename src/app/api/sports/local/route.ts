import { NextResponse } from "next/server";
import { getLocalSportsGames } from "@/lib/integrations/local-sports";
import { easternDayKey } from "@/lib/tz";

export const revalidate = 300;

/** Today's Hood, Mount, and FCC games. The Today client island uses this
 * endpoint so an idle day adds no server-rendered weight or empty furniture. */
export async function GET() {
  const now = new Date();
  const today = easternDayKey(now);
  const games = (await getLocalSportsGames(now))
    .filter((game) => easternDayKey(new Date(game.startsAt)) === today)
    .slice(0, 10);

  return NextResponse.json(
    { games },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    },
  );
}
