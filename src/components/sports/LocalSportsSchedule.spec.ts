import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SportsGame } from "@/lib/sports/types";
import LocalSportsSchedule from "./LocalSportsSchedule";
import { SPORTS_TEAM_IDENTITIES } from "@/lib/sports/team-identity";

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
  it("binds each identity to the canonical team ID while retaining real home/away facts and sources", async () => {
    const games: SportsGame[] = [
      { ...homeGame(), ticketsUrl: "https://hoodathletics.com/tickets", watchUrl: "https://hoodathletics.com/watch" },
      { ...homeGame(), id: "mount-away", teamId: "mount", teamName: "Mount St. Mary's", teamNickname: "Mountaineers", homeAway: "away", location: "Away campus", sourceUrl: "https://mountathletics.com/calendar", ticketsUrl: "https://mountathletics.com/away-tickets", timeTba: true },
      { ...homeGame(), id: "fcc-final", teamId: "fcc", teamName: "Frederick Community College", teamNickname: "Cougars", homeAway: "neutral", location: "Tournament site", state: "final", result: "W", teamScore: "7", opponentScore: "4", recapUrl: "https://www.fccathletics.com/recap", sourceUrl: "https://www.fccathletics.com/composite" },
    ];
    const html = renderToStaticMarkup(await LocalSportsSchedule({
      gamesPromise: Promise.resolve(games), now: new Date("2026-08-19T20:00:00Z"),
    }));
    for (const game of games) {
      const row = html.match(new RegExp(String.raw`<details[^>]*data-sports-team="${game.teamId}"[\s\S]*?</details>`))?.[0];
      expect(row).toBeDefined();
      expect(row).toContain(`--team-primary:${SPORTS_TEAM_IDENTITIES[game.teamId].primary}`);
      expect(row).toContain(`--team-secondary:${SPORTS_TEAM_IDENTITIES[game.teamId].secondary}`);
      expect(row).toContain(game.teamNickname);
      expect(row).toContain(game.homeAway);
      expect(row).toContain(`dateTime="${game.startsAt}"`);
    }
    expect(html).toContain('href="https://hoodathletics.com/tickets"');
    expect(html).toContain('href="https://hoodathletics.com/watch"');
    expect(html).not.toContain('href="https://mountathletics.com/away-tickets"');
    expect(html).toContain("Time TBA");
    expect(html).toContain("Away · Away campus");
    expect(html).toContain("W 7–4");
    expect(html).toContain("Neutral · Tournament site");
    expect(html).toContain('href="https://www.fccathletics.com/recap"');
  });

  it("keeps cancelled/postponed games and failed feeds out of the upcoming board", async () => {
    const html = renderToStaticMarkup(await LocalSportsSchedule({
      gamesPromise: Promise.resolve([
        { ...homeGame(), state: "cancelled" }, { ...homeGame(), state: "postponed", id: "postponed" },
      ]), now: new Date("2026-08-01T12:00:00Z"),
    }));
    expect(html).not.toContain('data-sports-team=');
    expect(html).toContain("The next college schedules are not posted yet.");
    const failed = renderToStaticMarkup(await LocalSportsSchedule({
      gamesPromise: Promise.reject(new Error("unavailable")), now: new Date("2026-08-01T12:00:00Z"),
    }));
    expect(failed).not.toContain('data-sports-team=');
    expect(failed).toContain('href="/events?intent=sports"');
  });

});
