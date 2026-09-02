import { describe, expect, it } from "vitest";

import { activeMoment } from "@/data/civic-moments";

import { todayFairPromotionPhase } from "./fair-promotion";

describe("todayFairPromotionPhase", () => {
  it.each([
    ["2026-09-02T03:59:59.000Z", null],
    ["2026-09-02T04:00:00.000Z", "planning"],
    ["2026-09-18T03:59:59.000Z", "planning"],
    ["2026-09-18T04:00:00.000Z", "fair-day"],
    ["2026-09-27T03:59:59.000Z", "fair-day"],
    ["2026-09-27T04:00:00.000Z", null],
  ] as const)("returns the expected phase at %s", (instant, phase) => {
    expect(todayFairPromotionPhase(new Date(instant))).toBe(phase);
  });

  it("stays present while a newer civic moment owns the general spotlight", () => {
    const duringInTheStreets = new Date("2026-09-10T16:00:00.000Z");

    expect(activeMoment(duringInTheStreets)?.slug).toBe("in-the-street-2026");
    expect(todayFairPromotionPhase(duringInTheStreets)).toBe("planning");
  });
});
