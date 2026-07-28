import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLiveIncidentSnapshot: vi.fn(),
}));

vi.mock("@/lib/live/incidentSnapshot", () => ({
  getLiveIncidentSnapshot: mocks.getLiveIncidentSnapshot,
}));

import { GET } from "./route";

describe("GET /api/pulse/incidents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the safe snapshot with a short shared cache", async () => {
    mocks.getLiveIncidentSnapshot.mockResolvedValue({
      items: [],
      totalCount: 0,
      corroboratedCount: 0,
      chartAvailable: false,
      updatedAt: "2026-07-27T18:00:00.000Z",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=30, stale-while-revalidate=60",
    );
    await expect(response.json()).resolves.toEqual({
      items: [],
      totalCount: 0,
      corroboratedCount: 0,
      chartAvailable: false,
      updatedAt: "2026-07-27T18:00:00.000Z",
    });
  });
});
