import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStoredFoodTruckSchedule: vi.fn(),
}));

vi.mock("@/lib/food-trucks/schedule-loader", () => ({
  getStoredFoodTruckSchedule: mocks.getStoredFoodTruckSchedule,
}));

import { GET } from "./route";

describe("GET /api/food-trucks/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStoredFoodTruckSchedule.mockResolvedValue({
      version: 1,
      generatedAt: "2026-08-14T12:00:00.000Z",
      windowStart: "2026-08-14T04:00:00.000Z",
      windowEnd: "2026-08-22T04:00:00.000Z",
      stops: [
        { id: "one", vendors: [{ name: "Truck one", slug: "truck-one" }] },
        { id: "two", vendors: [{ name: "Truck two" }] },
      ],
      sources: [
        {
          id: "one",
          label: "One",
          ok: true,
          count: 1,
          checkedAt: "2026-08-14T12:00:00.000Z",
        },
        {
          id: "two",
          label: "Two",
          ok: true,
          count: 1,
          checkedAt: "2026-08-14T12:00:00.000Z",
        },
      ],
    });
  });

  it("reports the durable public schedule counts", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "current",
      generatedAt: "2026-08-14T12:00:00.000Z",
      counts: {
        stops: 2,
        sources: 2,
        healthySources: 2,
        failedSources: 0,
        productiveSources: 2,
        suspiciousSources: 0,
      },
    });
  });

  it("keeps a readable partial artifact but marks it degraded", async () => {
    mocks.getStoredFoodTruckSchedule.mockResolvedValue({
      version: 1,
      generatedAt: "2026-08-14T12:00:00.000Z",
      windowStart: "2026-08-14T04:00:00.000Z",
      windowEnd: "2026-08-22T04:00:00.000Z",
      stops: [{ id: "one", vendors: [{ name: "Truck one" }] }],
      sources: [
        {
          id: "one",
          label: "One",
          ok: true,
          count: 1,
          checkedAt: "2026-08-14T12:00:00.000Z",
        },
        {
          id: "two",
          label: "Two",
          ok: false,
          count: 0,
          checkedAt: "2026-08-14T12:00:00.000Z",
        },
      ],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      status: "degraded",
      counts: { healthySources: 1, failedSources: 1 },
    });
  });

  it("returns an honest unavailable response when no current artifact exists", async () => {
    mocks.getStoredFoodTruckSchedule.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      status: "unavailable",
      generatedAt: null,
      counts: { stops: null, sources: null },
    });
  });
});
