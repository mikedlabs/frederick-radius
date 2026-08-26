import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getFoodTruckAvailability: vi.fn(),
  isRateLimited: vi.fn(),
}));

vi.mock("@/lib/food-trucks/availability", () => ({
  getFoodTruckAvailability: mocks.getFoodTruckAvailability,
}));
vi.mock("@/lib/origin-check", () => ({ isRateLimited: mocks.isRateLimited }));

import { GET } from "./route";

const request = () => new NextRequest("https://frederickradius.app/api/food-trucks/live");

describe("public live food-truck read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-07-22T18:00:00.000Z",
      scheduleState: "unavailable",
      items: [],
    });
  });

  it("returns an honest empty live layer", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, pins: [] });
  });

  it("publishes only roster identity plus the opted-in beacon fields", async () => {
    mocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-07-22T18:00:00.000Z",
      scheduleState: "current",
      items: [{
        id: "beacon:in10se-bbq",
        kind: "operator-live",
        truckSlug: "in10se-bbq",
        name: "In10se BBQ",
        cuisine: "Barbecue",
        lat: 39.414,
        lng: -77.41,
        spot: "Baker Park",
        note: "Brisket until sold out",
        startsAt: "2026-07-22T16:00:00.000Z",
        endsAt: "2026-07-22T20:00:00.000Z",
        sourceName: "Operator live beacon",
        sourceUrl: "/food-trucks#truck-in10se-bbq",
        sourceConfidence: "operator",
        href: "/food-trucks#truck-in10se-bbq",
      }],
    });

    const body = await (await GET(request())).json();
    expect(body.pins).toEqual([expect.objectContaining({
      slug: "in10se-bbq",
      name: "In10se BBQ",
      cuisine: "Barbecue",
      spot: "Baker Park",
      availability: "operator-live",
    })]);
  });

  it("keeps a publisher schedule visibly distinct from a live beacon", async () => {
    mocks.getFoodTruckAvailability.mockResolvedValue({
      checkedAt: "2026-07-22T18:00:00.000Z",
      scheduleState: "current",
      items: [{
        id: "schedule:stop-1:in10se-bbq",
        kind: "published-stop",
        truckSlug: "in10se-bbq",
        name: "In10se BBQ",
        cuisine: "Barbecue",
        lat: 39.414,
        lng: -77.41,
        venueName: "Test Venue",
        municipality: "Frederick",
        startsAt: "2026-07-22T19:00:00.000Z",
        endsAt: "2026-07-22T22:00:00.000Z",
        sourceName: "Test Venue",
        sourceUrl: "https://example.com/schedule",
        sourceConfidence: "venue",
        href: "/food-trucks#truck-in10se-bbq",
      }],
    });

    const body = await (await GET(request())).json();
    expect(body.scheduleState).toBe("current");
    expect(body.pins).toEqual([expect.objectContaining({
      availability: "published-stop",
      venueName: "Test Venue",
      sourceName: "Test Venue",
    })]);
    expect(body.pins[0]).not.toHaveProperty("note");
  });

  it("rate-limits abusive polling before reading the database", async () => {
    mocks.isRateLimited.mockResolvedValue(true);
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.getFoodTruckAvailability).not.toHaveBeenCalled();
  });
});
