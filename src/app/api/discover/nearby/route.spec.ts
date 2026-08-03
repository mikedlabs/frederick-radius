import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchNearby: vi.fn(),
  isSameOriginRequest: vi.fn(),
  isRateLimited: vi.fn(),
}));

vi.mock("@/lib/integrations/google-nearby", () => ({
  FREDERICK_CENTER: { lat: 39.4143, lng: -77.4105 },
  searchNearby: mocks.searchNearby,
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
}));

import { GET } from "./route";

describe("GET /api/discover/nearby input contract", () => {
  const priorKey = process.env.GOOGLE_PLACES_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.searchNearby.mockResolvedValue({
      ok: true,
      count: 0,
      places: [],
      dropped_out_of_county: 0,
    });
  });

  afterEach(() => {
    if (priorKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = priorKey;
  });

  it.each([
    "?lat=39.4143",
    "?lng=-77.4105",
    "?lat=&lng=",
    "?lat=39.4143&lng=",
  ])("rejects an incomplete or blank coordinate pair: %s", async (query) => {
    const response = await GET(new Request(`https://frederickradius.app/api/discover/nearby${query}`));

    expect(response.status).toBe(400);
    expect(mocks.searchNearby).not.toHaveBeenCalled();
  });

  it("rejects a municipality plus coordinates instead of silently discarding the coordinates", async () => {
    const response = await GET(new Request(
      "https://frederickradius.app/api/discover/nearby?muni=frederick&lat=39.4143&lng=-77.4105",
    ));

    expect(response.status).toBe(400);
    expect(mocks.searchNearby).not.toHaveBeenCalled();
  });

  it("passes a complete coordinate pair to the paid provider", async () => {
    const response = await GET(new Request(
      "https://frederickradius.app/api/discover/nearby?lat=39.4143&lng=-77.4105&max=4",
    ));

    expect(response.status).toBe(200);
    expect(mocks.searchNearby).toHaveBeenCalledWith(expect.objectContaining({
      center: { lat: 39.4143, lng: -77.4105 },
      maxResultCount: 4,
    }));
  });
});
