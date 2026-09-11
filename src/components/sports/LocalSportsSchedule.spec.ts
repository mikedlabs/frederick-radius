import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SportsGame } from "@/lib/sports/types";
import LocalSportsSchedule from "./LocalSportsSchedule";

function homeGame(): SportsGame {
  return {
    id: "hood-home",
    teamId: "hood",
    teamName: "Hood College",
    teamNickname: "Blazers",
    sport: "Women's Soccer",
    startsAt: "2026-08-19T22:00:00.000Z",
    timeTba: false,
    homeAway: "home",
    opponent: "Washington Adventist",
    venue: "Thomas Athletic Field",
    location: "Frederick, MD",
    state: "scheduled",
    result: null,
    teamScore: null,
    opponentScore: null,
    sourceUrl: "https://hoodathletics.com/calendar",
    watchUrl: null,
    statsUrl: null,
    ticketsUrl: null,
    recapUrl: null,
    verifiedAt: "2026-07-23T12:00:00.000Z",
  };
}

describe("LocalSportsSchedule", () => {
  it("uses the defined positive tint for a home-game badge", async () => {
    const element = await LocalSportsSchedule({
      gamesPromise: Promise.resolve([homeGame()]),
      now: new Date("2026-08-01T12:00:00.000Z"),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("var(--app-positive-tint-14)");
    expect(html).not.toContain("var(--app-positive-soft)");
  });
});
