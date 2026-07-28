import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(),
  isRateLimited: vi.fn(),
  meterUsage: vi.fn(),
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
}));
vi.mock("@/lib/usage-meter", () => ({ meterUsage: mocks.meterUsage }));
vi.mock("@/lib/mapbox-server", () => ({
  MAPBOX_SERVER_TOKEN: "test-mapbox-token",
  MAPBOX_SERVER_HEADERS: { Referer: "https://frederickradius.app/" },
}));

import { GET } from "./route";

const geojson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-77.42, 39.4],
            [-77.4, 39.4],
            [-77.4, 39.42],
            [-77.42, 39.42],
            [-77.42, 39.4],
          ],
        ],
      },
    },
  ],
};

function request(
  mode: string,
  minutes: string,
  lng = "-77.411",
  lat = "39.414",
) {
  return new NextRequest(
    `https://frederickradius.app/api/isochrone?lng=${lng}&lat=${lat}&mode=${mode}&minutes=${minutes}`,
    { headers: { Referer: "https://frederickradius.app/radius" } },
  );
}

describe("Mapbox isochrone route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => Response.json(geojson),
    );
  });

  it("accepts every whole minute emitted by the fine-tune slider", async () => {
    for (let minutes = 3; minutes <= 30; minutes += 1) {
      const response = await GET(request("bike", String(minutes)));
      expect(response.status).toBe(200);
      expect((await response.json()).minutes).toBe(minutes);
    }

    expect(globalThis.fetch).toHaveBeenCalledTimes(28);
  });

  it("accepts a non-preset whole minute and caches walking for one day", async () => {
    const response = await GET(request("walk", "7"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      mode: "walk",
      minutes: 7,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/walking/-77.411,39.414?contours_minutes=7"),
      expect.objectContaining({ next: { revalidate: 86_400 } }),
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    );
  });

  it("uses traffic-aware driving with a five-minute cache", async () => {
    const response = await GET(request("drive", "30"));

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/driving-traffic/-77.411,39.414?contours_minutes=30",
      ),
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300, stale-while-revalidate=300",
    );
  });

  it.each(["0", "61", "7.5", "7minutes", ""])(
    "rejects an unsupported minute value (%s) before Mapbox",
    async (minutes) => {
      const response = await GET(request("bike", minutes));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        ok: false,
        reason: "bad-minutes",
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects a bbox-valid point outside the county polygon before Mapbox", async () => {
    const response = await GET(
      request("walk", "10", "-77.6528", "39.5062"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "out-of-county",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.meterUsage).not.toHaveBeenCalled();
  });
});
