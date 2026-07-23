import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
  put: vi.fn(),
}));

import { isFoodTruckScheduleSnapshot } from "./schedule-store";

describe("food-truck schedule cache validation", () => {
  const valid = {
    version: 1,
    generatedAt: "2026-07-22T12:00:00.000Z",
    windowStart: "2026-07-22T04:00:00.000Z",
    windowEnd: "2026-07-30T04:00:00.000Z",
    stops: [{
      id: "stop-1",
      title: "A stop",
      startsAt: "2026-07-24T21:00:00.000Z",
      venueName: "A venue",
      vendors: [{ name: "A truck" }],
      sourceName: "Official source",
      sourceUrl: "https://example.com",
      confidence: "venue",
    }],
    sources: [],
  };

  it("accepts a complete serialized snapshot", () => {
    expect(isFoodTruckScheduleSnapshot(valid)).toBe(true);
  });

  it("rejects a partial stop instead of rendering corrupted data", () => {
    expect(isFoodTruckScheduleSnapshot({ ...valid, stops: [{ id: "broken" }] })).toBe(false);
  });
});
