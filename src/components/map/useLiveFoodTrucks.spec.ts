import { describe, expect, it } from "vitest";
import { liveFoodTruckPollDelay } from "./useLiveFoodTrucks";

describe("live food-truck polling policy", () => {
  it("backs an empty live layer off to five minutes", () => {
    expect(liveFoodTruckPollDelay(0)).toBe(300_000);
    expect(liveFoodTruckPollDelay(0, 300_000)).toBe(300_000);
  });

  it("keeps the one-minute interval while a beacon is active", () => {
    expect(liveFoodTruckPollDelay(1)).toBe(60_000);
    expect(liveFoodTruckPollDelay(3, 60_000)).toBe(60_000);
  });

  it("rejects server hints that could create a tight or excessive loop", () => {
    expect(liveFoodTruckPollDelay(1, 1_000)).toBe(60_000);
    expect(liveFoodTruckPollDelay(0, 900_000)).toBe(300_000);
  });
});
