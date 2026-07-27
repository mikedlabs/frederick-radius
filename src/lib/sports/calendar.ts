import type { IcsInput } from "@/lib/ics";
import type { SportsGame } from "@/lib/sports/types";

const ORIGIN = "https://frederickradius.app";

/** Convert one verified local-team game into the shared calendar-feed shape. */
export function localGameIcsInput(game: SportsGame): IcsInput {
  const start = Date.parse(game.startsAt);
  const homeAway =
    game.homeAway === "home"
      ? "Home game"
      : game.homeAway === "away"
        ? "Away game"
        : "Neutral-site game";
  const timing = game.timeTba ? " Time TBA." : "";
  return {
    uid: `local-sports-${game.id}`,
    title: `${game.teamName} ${game.homeAway === "away" ? "at" : "vs."} ${game.opponent}${game.timeTba ? " (Time TBA)" : ""}`,
    starts_at: game.startsAt,
    ends_at: new Date(start + 2 * 60 * 60 * 1000).toISOString(),
    description: `${game.sport}. ${homeAway}.${timing} Verified by ${game.teamName}'s official athletics calendar.`,
    venue_name: game.venue ?? undefined,
    address: game.location ?? undefined,
    url: `${ORIGIN}/sports`,
    all_day: game.timeTba,
  };
}
