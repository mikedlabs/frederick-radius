import { describe, expect, it } from "vitest";
import { RADIUS_TOOLS } from "@/data/radius-tools";
import {
  DEFAULT_TOOL_DECK_PIN_IDS,
  TOOL_DECK_GROUP_DEFINITIONS,
  TOOL_DECK_PIN_LIMIT,
  normalizeToolDeckPins,
} from "./toolDeckModel";

describe("Tool Deck model", () => {
  it("organizes the base experience into nine clear groups", () => {
    expect(TOOL_DECK_GROUP_DEFINITIONS).toHaveLength(9);
    expect(TOOL_DECK_GROUP_DEFINITIONS.map((group) => group.label)).toEqual([
      "Find something",
      "Food & drink",
      "Events & outdoors",
      "Get around",
      "Nearby essentials",
      "Conditions & help",
      "Community services",
      "History & local data",
      "Saved & settings",
    ]);
  });

  it("keeps each configured tool in exactly one group", () => {
    const ids = TOOL_DECK_GROUP_DEFINITIONS.flatMap((group) => group.toolIds);
    const expectedIds = ["ask-radius", ...RADIUS_TOOLS.map((tool) => tool.id)];

    expect(RADIUS_TOOLS).toHaveLength(61);
    expect(ids).toHaveLength(expectedIds.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...expectedIds].sort());
  });

  it("starts with a useful four-tool belt", () => {
    expect(DEFAULT_TOOL_DECK_PIN_IDS).toEqual([
      "ask-radius",
      "nearby",
      "county-pulse",
      "public-essentials",
    ]);
  });

  it("filters invalid and duplicate stored pins and enforces the limit", () => {
    const available = new Set([
      ...DEFAULT_TOOL_DECK_PIN_IDS,
      "events",
      "parking",
      "transit",
      "scanner",
      "trails",
      "brunch",
      "rivers",
    ]);
    expect(
      normalizeToolDeckPins(
        [
          "events",
          "events",
          "missing",
          "parking",
          "transit",
          "scanner",
          "trails",
          "brunch",
          "rivers",
        ],
        available,
      ),
    ).toEqual([
      "events",
      "parking",
      "transit",
      "scanner",
      "trails",
      "brunch",
    ]);
    expect(
      normalizeToolDeckPins([], available),
    ).toHaveLength(0);
    expect(
      normalizeToolDeckPins("not an array", available),
    ).toEqual([...DEFAULT_TOOL_DECK_PIN_IDS]);
    expect(
      normalizeToolDeckPins(null, new Set(["ask-radius", "nearby"])),
    ).toEqual(["ask-radius", "nearby"]);
    expect(TOOL_DECK_PIN_LIMIT).toBe(6);
  });

});
