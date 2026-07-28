import { describe, expect, it } from "vitest";
import { isCompetitiveSportsEvent } from "./competitive-sports";

describe("isCompetitiveSportsEvent", () => {
  it.each([
    "Board Game Night",
    "Game Night: Texas Hold’em Poker",
    "Thursday Night Trivia",
    "Frederick Key's Tickets",
    "Mount 101 Bible Study & Sports Night",
    "Basketball Skills Camp Session 2",
    "Youth Soccer Clinic",
    "Pickleball Fundraiser",
    "Hot Dogs & Volleyball on the Quad",
  ])("rejects sports-adjacent listing noise: %s", (title) => {
    expect(
      isCompetitiveSportsEvent({
        category: "sports",
        title,
        description: "A local listing.",
      }),
    ).toBe(false);
  });

  it.each([
    ["Frederick Keys vs. Wilmington Blue Rocks", ""],
    ["Carolyn Clark Classic Volleyball Tournament", ""],
    ["4v4 Intramural Beach Volleyball", ""],
    [
      "Friday Night Lights Tennis",
      "Singles and doubles match play on the Fleming Avenue courts.",
    ],
  ])("keeps a real competitive event: %s", (title, description) => {
    expect(
      isCompetitiveSportsEvent({ category: "sports", title, description }),
    ).toBe(true);
  });

  it("does not admit a non-sports event just because its title says game", () => {
    expect(
      isCompetitiveSportsEvent({
        category: "community",
        title: "Community game night",
      }),
    ).toBe(false);
  });
});
