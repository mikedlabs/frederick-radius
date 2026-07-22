import { describe, expect, it } from "vitest";
import { RADIUS_TOOLS } from "@/data/radius-tools";
import { toolMatchesQuery, toolQueryTerms } from "./toolQuery";

function tool(id: string) {
  const match = RADIUS_TOOLS.find((item) => item.id === id);
  if (!match) throw new Error(`Missing test tool: ${id}`);
  return match;
}

function matchingToolIds(query: string): string[] {
  return RADIUS_TOOLS
    .filter((item) => toolMatchesQuery(item, query))
    .map((item) => item.id);
}

describe("toolQueryTerms", () => {
  it("removes conversational filler and normalizes resident vocabulary", () => {
    expect(toolQueryTerms("Where can I find bathrooms near me?")).toEqual([
      "restroom",
    ]);
    expect(toolQueryTerms("I need a trash can near me")).toEqual([
      "trash",
      "can",
    ]);
  });
});

describe("toolMatchesQuery", () => {
  it.each([
    ["bathrooms", "restrooms"],
    ["charge my phone", "power-outlets"],
    ["bus", "transit"],
    ["something tonight", "events"],
    ["what can I do tonight", "events"],
    ["trash can near me", "trash-cans"],
  ])("matches %s to %s", (query, id) => {
    expect(toolMatchesQuery(tool(id), query)).toBe(true);
  });

  it("requires the whole request instead of returning a partial keyword hit", () => {
    expect(toolMatchesQuery(tool("ev-charging"), "charge my phone")).toBe(false);
    expect(toolMatchesQuery(tool("nearby"), "trash can near me")).toBe(false);
  });

  it("uses the shared fuzzy matcher for a clear typo", () => {
    expect(toolMatchesQuery(tool("restrooms"), "bathrom")).toBe(true);
  });

  it.each([
    ["where can I charge an iPhone", "power-outlets", "ev-charging"],
    ["where can I charge my car", "ev-charging", "power-outlets"],
    ["where can I refill my water bottle", "water", "rivers"],
    ["where can I park downtown", "parking", "parks"],
    ["I need Wi-Fi to work", "public-wifi", "public-essentials"],
    ["find public transit schedules", "transit", "event-calendar"],
    ["where can I mail a letter", "shipping", "dear-frederick"],
  ])("routes %s to %s instead of %s", (query, expected, rejected) => {
    const matches = matchingToolIds(query);
    expect(matches).toContain(expected);
    expect(matches).not.toContain(rejected);
  });

  it("keeps distinct intents when one request names two tools", () => {
    expect(matchingToolIds("I need downtown parking and a bus schedule")).toEqual([
      "parking",
      "transit",
    ]);
  });

  it("does not turn river-level language into a drinking-water request", () => {
    const matches = matchingToolIds("river water levels");
    expect(matches).toContain("rivers");
    expect(matches).not.toContain("water");
  });
});
