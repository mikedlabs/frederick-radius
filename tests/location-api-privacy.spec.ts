import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  nearbyNow: vi.fn(),
  isSameOriginRequest: vi.fn(),
  isRateLimited: vi.fn(),
  meterUsage: vi.fn(),
  postgisNearbyMode: vi.fn(),
  postgisNearbyPlaceDistances: vi.fn(),
}));

vi.mock("@/lib/connect", () => ({
  DEFAULT_NEARBY_RADIUS_M: 19_312,
  nearbyNow: mocks.nearbyNow,
}));
vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
}));
vi.mock("@/lib/spatial/place-spatial-index", () => ({
  postgisNearbyMode: mocks.postgisNearbyMode,
  postgisNearbyPlaceDistances: mocks.postgisNearbyPlaceDistances,
}));
vi.mock("@/lib/usage-meter", () => ({ meterUsage: mocks.meterUsage }));
vi.mock("@/lib/mapbox", () => ({
  MAPBOX_TOKEN: "test-mapbox-token",
  MAPBOX_SERVER_HEADERS: { Referer: "https://frederickradius.app/" },
}));

import { GET as nearby } from "@/app/api/nearby/route";
import { GET as isochrone } from "@/app/api/isochrone/route";

describe("location API privacy grid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.nearbyNow.mockReturnValue({ origin: { lng: -77.411, lat: 39.414 } });
    mocks.postgisNearbyMode.mockReturnValue("off");
    mocks.postgisNearbyPlaceDistances.mockResolvedValue(null);
  });

  it("canonicalizes an exact nearby fix before computing or publicly caching it", async () => {
    const request = new Request(
      "https://frederickradius.app/api/nearby?lng=-77.41062&lat=39.41437&limit=6",
      { headers: { Referer: "https://frederickradius.app/today" } },
    );

    const response = await nearby(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://frederickradius.app/api/nearby?lng=-77.411&lat=39.414&limit=6",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.nearbyNow).not.toHaveBeenCalled();
  });

  it("uses only the rounded origin in the nearby response contract", async () => {
    const request = new Request(
      "https://frederickradius.app/api/nearby?lng=-77.411&lat=39.414&limit=6",
      { headers: { Referer: "https://frederickradius.app/today" } },
    );

    const response = await nearby(request);

    expect(response.status).toBe(200);
    expect(mocks.nearbyNow).toHaveBeenCalledWith(
      { lng: -77.411, lat: 39.414 },
      expect.objectContaining({ limit: 6 }),
    );
  });

  it("passes only the rounded origin to an enabled PostGIS read", async () => {
    const distances = new Map([["alpha", 42]]);
    mocks.postgisNearbyMode.mockReturnValue("on");
    mocks.postgisNearbyPlaceDistances.mockResolvedValue(distances);
    const request = new Request(
      "https://frederickradius.app/api/nearby?lng=-77.411&lat=39.414&limit=6",
      { headers: { Referer: "https://frederickradius.app/today" } },
    );

    const response = await nearby(request);

    expect(response.status).toBe(200);
    expect(mocks.postgisNearbyPlaceDistances).toHaveBeenCalledWith(
      { lng: -77.411, lat: 39.414 },
      19_312,
    );
    expect(mocks.nearbyNow).toHaveBeenLastCalledWith(
      { lng: -77.411, lat: 39.414 },
      expect.objectContaining({
        limit: 6,
        placeDistances: distances,
      }),
    );
  });

  it("canonicalizes an exact isochrone fix before a paid Mapbox call", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const request = new NextRequest(
      "https://frederickradius.app/api/isochrone?lng=-77.41062&lat=39.41437&mode=walk&minutes=15",
      { headers: { Referer: "https://frederickradius.app/radius" } },
    );

    const response = await isochrone(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://frederickradius.app/api/isochrone?lng=-77.411&lat=39.414&mode=walk&minutes=15",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
