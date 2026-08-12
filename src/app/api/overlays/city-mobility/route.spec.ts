import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMobility: vi.fn(),
}));

vi.mock("@/lib/integrations/frederickCityMobility", () => ({
  getFrederickCityMobility: mocks.getMobility,
}));

import { GET } from "./route";

function collection(status: "current" | "stale" | "unavailable" = "current") {
  return {
    type: "FeatureCollection",
    features: [],
    radius: {
      status,
      coverage: status === "current" ? "complete" : "partial",
      checkedAt: "2026-08-11T16:00:00.000Z",
      queryBounds: {
        west: -77.43,
        south: 39.4,
        east: -77.38,
        north: 39.45,
      },
      queryDetail: "network",
      geography: "City of Frederick",
      routingRule: "Only confirmed EXISTING linework may inform a route.",
      sources: {},
    },
  };
}

beforeEach(() => {
  mocks.getMobility.mockReset();
  mocks.getMobility.mockResolvedValue(collection());
});

describe("City mobility overlay API", () => {
  it("requires a bounded viewport instead of returning city-wide geometry", async () => {
    const missing = await GET(
      new Request("https://frederickradius.app/api/overlays/city-mobility"),
    );
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ reason: "missing-area" });

    const wide = await GET(
      new Request(
        "https://frederickradius.app/api/overlays/city-mobility?bbox=-77.8,39.1,-77.0,39.8",
      ),
    );
    expect(wide.status).toBe(400);
    expect(await wide.json()).toMatchObject({ reason: "area-too-large" });
    expect(mocks.getMobility).not.toHaveBeenCalled();
  });

  it("rejects bounded boxes outside the City data coverage", async () => {
    const response = await GET(
      new Request(
        "https://frederickradius.app/api/overlays/city-mobility?bbox=-77.62,39.30,-77.57,39.35",
      ),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: "outside-coverage" });
    expect(mocks.getMobility).not.toHaveBeenCalled();
  });

  it("serves cacheable GeoJSON with status, coverage, and bike-source headers", async () => {
    const request = new Request(
      "https://frederickradius.app/api/overlays/city-mobility?bbox=-77.43,39.4,-77.38,39.45",
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/geo+json",
    );
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=600");
    expect(response.headers.get("X-Radius-Source-Status")).toBe("current");
    expect(response.headers.get("X-Radius-Source-Coverage")).toBe("complete");
    expect(response.headers.get("X-Radius-Bike-Paths-Status")).toBe(
      "unavailable",
    );
    expect(mocks.getMobility).toHaveBeenCalledWith(
      {
        west: -77.43,
        south: 39.4,
        east: -77.38,
        north: 39.45,
      },
      { includeRamps: false },
    );

    const etag = response.headers.get("ETag");
    const notModified = await GET(
      new Request(request.url, { headers: { "If-None-Match": etag ?? "" } }),
    );
    expect(notModified.status).toBe(304);
  });

  it("accepts a capped user-area request", async () => {
    const response = await GET(
      new Request(
        "https://frederickradius.app/api/overlays/city-mobility?lat=39.4143&lng=-77.4105&radiusM=1200",
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.getMobility).toHaveBeenCalledTimes(1);
  });

  it("loads dense ramp points only for a close street view", async () => {
    const response = await GET(
      new Request(
        "https://frederickradius.app/api/overlays/city-mobility?bbox=-77.42,39.41,-77.40,39.43&detail=street",
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.getMobility).toHaveBeenCalledWith(
      expect.any(Object),
      { includeRamps: true },
    );

    const wide = await GET(
      new Request(
        "https://frederickradius.app/api/overlays/city-mobility?bbox=-77.47,39.38,-77.37,39.47&detail=street",
      ),
    );
    expect(wide.status).toBe(400);
  });

  it("marks stale data and refuses to cache an unavailable response", async () => {
    mocks.getMobility.mockResolvedValueOnce(collection("stale"));
    const stale = await GET(
      new Request(
        "https://frederickradius.app/api/overlays/city-mobility?bbox=-77.43,39.4,-77.38,39.45",
      ),
    );
    expect(stale.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(stale.headers.get("X-Radius-Source-Status")).toBe("stale");

    mocks.getMobility.mockResolvedValueOnce(collection("unavailable"));
    const unavailable = await GET(
      new Request(
        "https://frederickradius.app/api/overlays/city-mobility?bbox=-77.43,39.4,-77.38,39.45",
      ),
    );
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Cache-Control")).toBe("no-store");
    expect(unavailable.headers.get("Retry-After")).toBe("300");
  });
});
