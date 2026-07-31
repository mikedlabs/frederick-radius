import { describe, expect, it } from "vitest";
import { RADIUS_TOOLS } from "@/data/radius-tools";
import {
  DEFAULT_TOOL_DECK_PIN_IDS,
  TOOL_DECK_GROUP_DEFINITIONS,
  TOOL_DECK_PIN_LIMIT,
  normalizeToolDeckPins,
  toolDeckMoment,
} from "./toolDeckModel";

describe("Tool Deck model", () => {
  it("organizes the base experience into nine clear groups", () => {
    expect(TOOL_DECK_GROUP_DEFINITIONS).toHaveLength(9);
    expect(TOOL_DECK_GROUP_DEFINITIONS.map((group) => group.label)).toEqual([
      "Decide & discover",
      "Food & drink",
      "Events & recreation",
      "Getting around",
      "Public amenities",
      "Live conditions & safety",
      "Community & services",
      "Frederick stories & data",
      "Yours & contribute",
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

  it("uses Frederick time for calm, non-feed-backed suggestions", () => {
    expect(toolDeckMoment(new Date("2026-08-01T13:00:00.000Z"))).toEqual(
      expect.objectContaining({
        label: "Weekend morning",
        suggestions: expect.arrayContaining([
          expect.objectContaining({ id: "brunch" }),
          expect.objectContaining({ id: "trails" }),
        ]),
      }),
    );
    expect(toolDeckMoment(new Date("2026-07-29T22:00:00.000Z"))).toEqual(
      expect.objectContaining({
        label: "Tonight",
        suggestions: expect.arrayContaining([
          expect.objectContaining({ id: "happy-hour" }),
          expect.objectContaining({ id: "parking" }),
        ]),
      }),
    );
    expect(toolDeckMoment(new Date("2026-07-29T06:00:00.000Z"))).toEqual(
      expect.objectContaining({
        label: "Late",
        suggestions: expect.arrayContaining([
          expect.objectContaining({ id: "road-cameras" }),
          expect.objectContaining({ id: "saved" }),
        ]),
      }),
    );
    expect(
      toolDeckMoment(new Date("2026-08-01T02:00:00.000Z")).label,
    ).toBe("Late");
  });

  it("falls back safely for an invalid clock and only suggests registered tools", () => {
    expect(toolDeckMoment(new Date(Number.NaN))).toEqual(toolDeckMoment(null));

    const availableIds: ReadonlySet<string> = new Set(
      TOOL_DECK_GROUP_DEFINITIONS.flatMap((group) => group.toolIds),
    );
    const moments = [
      null,
      new Date("2026-08-01T13:00:00.000Z"),
      new Date("2026-07-29T12:00:00.000Z"),
      new Date("2026-07-29T18:00:00.000Z"),
      new Date("2026-07-29T22:00:00.000Z"),
      new Date("2026-07-30T01:00:00.000Z"),
      new Date("2026-07-29T06:00:00.000Z"),
    ].map((now) => toolDeckMoment(now));

    for (const moment of moments) {
      const ids = moment.suggestions.map((suggestion) => suggestion.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => availableIds.has(id))).toBe(true);
      expect(moment.suggestions.every((suggestion) => suggestion.reason.trim()))
        .toBe(true);
    }
  });
});
