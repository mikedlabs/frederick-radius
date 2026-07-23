import { describe, expect, it } from "vitest";
import type { SportsGame } from "@/lib/sports/types";
import { buildIcs } from "@/lib/ics";
import { localGameIcsInput } from "./route";

function game(overrides: Partial<SportsGame> = {}): SportsGame {
  return {
    id: "fcc-tba",
    teamId: "fcc",
    teamName: "Frederick Community College",
    teamNickname: "Cougars",
    sport: "Women's Volleyball",
    startsAt: "2026-08-22T16:00:00.000Z",
    timeTba: true,
    homeAway: "away",
    opponent: "TBA",
    venue: null,
    location: null,
    state: "scheduled",
    result: null,
    teamScore: null,
    opponentScore: null,
    sourceUrl: "https://www.fccathletics.com/composite",
    watchUrl: null,
    statsUrl: null,
    ticketsUrl: null,
    recapUrl: null,
    verifiedAt: "2026-07-23T12:00:00.000Z",
    ...overrides,
  };
}

describe("sports calendar entries", () => {
  it("publishes a time-TBA game as an all-day reminder, not a fake noon game", () => {
    const input = localGameIcsInput(game());
    const ics = buildIcs(input);

    expect(input.all_day).toBe(true);
    expect(input.title).toContain("Time TBA");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260822");
    expect(ics).not.toContain("DTSTART:20260822T160000Z");
  });

  it("keeps a published game time as a timed calendar entry", () => {
    const input = localGameIcsInput(
      game({
        startsAt: "2026-08-22T21:00:00.000Z",
        timeTba: false,
        opponent: "Hood College",
      }),
    );
    const ics = buildIcs(input);

    expect(input.all_day).toBe(false);
    expect(input.title).not.toContain("Time TBA");
    expect(ics).toContain("DTSTART:20260822T210000Z");
  });
});
