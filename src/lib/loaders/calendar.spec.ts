import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIngestedSeries: vi.fn(),
  allUpcoming: vi.fn(),
  getCachedLiveEvents: vi.fn(),
  getLiveEvents: vi.fn(),
}));

vi.mock("./ingested", () => ({
  getIngestedSeries: mocks.getIngestedSeries,
}));
vi.mock("./events", () => ({
  allUpcoming: mocks.allUpcoming,
}));
vi.mock("@/lib/integrations/ical-live", () => ({
  getCachedLiveEvents: mocks.getCachedLiveEvents,
  getLiveEvents: mocks.getLiveEvents,
}));

import { getMonthEvents } from "./calendar";

describe("calendar event loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIngestedSeries.mockResolvedValue([]);
    mocks.allUpcoming.mockReturnValue([]);
    mocks.getCachedLiveEvents.mockResolvedValue({
      events: [{
        id: "live:test",
        title: "Cached summer event",
        starts_at: "2026-07-18T23:00:00.000Z",
        municipality: "frederick",
        category: "music",
      }],
      sources_succeeded: ["city-frederick"],
      sources_failed: [],
    });
  });

  it("reads the warmed parsed boundary instead of raw upstream feeds", async () => {
    const result = await getMonthEvents(new Date(2026, 6, 1));

    expect(mocks.getCachedLiveEvents).toHaveBeenCalledWith(90);
    expect(mocks.getLiveEvents).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
    expect(result.byDay["2026-07-18"]).toEqual([
      expect.objectContaining({
        id: "l:live:test",
        title: "Cached summer event",
        source: "live",
      }),
    ]);
  });
});
