import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getFreshestBeaconByTruck: vi.fn(),
  isRateLimited: vi.fn(),
}));

vi.mock("@/lib/loaders/truckBeacons", () => ({
  getFreshestBeaconByTruck: mocks.getFreshestBeaconByTruck,
}));
vi.mock("@/lib/origin-check", () => ({ isRateLimited: mocks.isRateLimited }));

import { GET } from "./route";

const request = () => new NextRequest("https://frederickradius.app/api/food-trucks/live");

describe("public live food-truck read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.getFreshestBeaconByTruck.mockResolvedValue(new Map());
  });

  it("returns an honest empty live layer", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age=10");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain(
      "s-maxage=30",
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      status: "idle",
      nextPollAfterMs: 300_000,
      pins: [],
    });
  });

  it("publishes only roster identity plus the opted-in beacon fields", async () => {
    mocks.getFreshestBeaconByTruck.mockResolvedValue(new Map([[
      "in10se-bbq",
      {
        truckSlug: "in10se-bbq",
        lat: 39.414,
        lng: -77.41,
        spot: "Baker Park",
        note: "Brisket until sold out",
        startedAt: "2026-07-22T16:00:00.000Z",
        expiresAt: "2026-07-22T20:00:00.000Z",
      },
    ]]));

    const body = await (await GET(request())).json();
    expect(body).toMatchObject({
      status: "active",
      nextPollAfterMs: 60_000,
    });
    expect(body.pins).toEqual([expect.objectContaining({
      slug: "in10se-bbq",
      name: "In10se BBQ",
      cuisine: "Barbecue",
      spot: "Baker Park",
    })]);
  });

  it("rate-limits abusive polling before reading the database", async () => {
    mocks.isRateLimited.mockResolvedValue(true);
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.getFreshestBeaconByTruck).not.toHaveBeenCalled();
  });
});
