import { describe, expect, it } from "vitest";
import { askPlanMaxDistance } from "./plan-preview";

describe("Ask plan fit", () => {
  it("applies a walking radius only to a walking plan", () => {
    expect(askPlanMaxDistance("walk", { walkingTolerance: "short" }))
      .toBe(1_200);
    expect(askPlanMaxDistance(null, {
      travelMode: "walk",
      walkingTolerance: "moderate",
    })).toBe(2_400);
    expect(askPlanMaxDistance("drive", { walkingTolerance: "short" }))
      .toBeUndefined();
    expect(askPlanMaxDistance(null, { walkingTolerance: "short" }))
      .toBeUndefined();
  });
});
