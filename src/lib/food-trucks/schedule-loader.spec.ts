import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodTruckScheduleSnapshot } from "./schedule-types";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  read: vi.fn(),
}));

vi.mock("./schedule", () => ({
  buildFoodTruckSchedule: mocks.build,
}));

vi.mock("./schedule-store", () => ({
  readStoredFoodTruckSchedule: mocks.read,
}));

import {
  getFoodTruckSchedule,
  getStoredFoodTruckSchedule,
} from "./schedule-loader";

const now = new Date("2026-07-30T16:00:00.000Z");
const current: FoodTruckScheduleSnapshot = {
  version: 1,
  generatedAt: "2026-07-30T12:00:00.000Z",
  windowStart: "2026-07-30T04:00:00.000Z",
  windowEnd: "2026-08-07T04:00:00.000Z",
  stops: [],
  sources: [],
};

describe("food-truck schedule loader", () => {
  beforeEach(() => {
    mocks.build.mockReset();
    mocks.read.mockReset();
  });

  it("returns the current cron-built snapshot without reading live feeds", async () => {
    mocks.read.mockResolvedValue(current);

    await expect(getStoredFoodTruckSchedule(now)).resolves.toBe(current);
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("does not live-fetch when the stored-only surface has no snapshot", async () => {
    mocks.read.mockResolvedValue(null);

    await expect(getStoredFoodTruckSchedule(now)).resolves.toBeNull();
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("preserves the live fallback for the dedicated food-truck board", async () => {
    const rebuilt = {
      ...current,
      generatedAt: now.toISOString(),
    };
    mocks.read.mockResolvedValue(null);
    mocks.build.mockResolvedValue(rebuilt);

    await expect(getFoodTruckSchedule(now)).resolves.toBe(rebuilt);
    expect(mocks.build).toHaveBeenCalledWith(now);
  });

  it("rejects a stale stored snapshot on lightweight surfaces", async () => {
    mocks.read.mockResolvedValue({
      ...current,
      generatedAt: "2026-07-27T12:00:00.000Z",
    });

    await expect(getStoredFoodTruckSchedule(now)).resolves.toBeNull();
  });
});
