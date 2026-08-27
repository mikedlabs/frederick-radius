import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isSameOriginRequest: vi.fn(),
  isRateLimited: vi.fn(),
  reserveDailyUsage: vi.fn(),
  runtimeEnabled: vi.fn(),
  routeCache: new Map<string, unknown>(),
  cacheOptions: [] as Array<{
    keys: string[];
    options: { revalidate?: number } | undefined;
  }>,
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (
      fn: (...args: unknown[]) => Promise<unknown>,
      keys: string[],
      options?: { revalidate?: number },
    ) => {
      mocks.cacheOptions.push({ keys, options });
      return async (...args: unknown[]) => {
        const cacheKey = JSON.stringify([keys, args]);
        if (mocks.routeCache.has(cacheKey)) {
          return mocks.routeCache.get(cacheKey);
        }
        const value = await fn(...args);
        mocks.routeCache.set(cacheKey, value);
        return value;
      };
    },
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isRateLimited: mocks.isRateLimited,
  // The routes call the two-bucket helper now. Delegate to the mocked
  // isRateLimited so tests that force a limit still see one, and assertions
  // on the (key, limit, window) triple keep working.
  isOverPaidRequestBudget: (
    req: Request,
    key: string,
    limit: number,
    windowSeconds: number,
  ) => mocks.isRateLimited(req, key, limit, windowSeconds),
}));
vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));
vi.mock("@/lib/mapbox-budget", () => ({
  mapboxDailyUsageCap: () => 100,
  mapboxRequestRuntimeEnabled: mocks.runtimeEnabled,
}));
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
    mocks.routeCache.clear();
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.runtimeEnabled.mockReturnValue(true);
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
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
    expect(mocks.reserveDailyUsage).toHaveBeenCalledTimes(28);
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
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(mocks.cacheOptions).toContainEqual({
      keys: ["mapbox-isochrone-day-v2"],
      options: { revalidate: 86_400 },
    });
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
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(mocks.cacheOptions).toContainEqual({
      keys: ["mapbox-isochrone-traffic-v2"],
      options: { revalidate: 300 },
    });
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
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
  });

  it("does not reserve or fetch a cached polygon twice", async () => {
    const first = await GET(request("walk", "12"));
    const second = await GET(request("walk", "12"));

    expect((await first.json()).ok).toBe(true);
    expect((await second.json()).ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "mapbox_isochrone",
      100,
    );
  });

  it.each([
    [null, "cost-control-unavailable"],
    [{ reserved: false, count: 100 }, "daily-cap-reached"],
  ])(
    "fails closed before Mapbox when reservation is %j",
    async (reservation, reason) => {
      mocks.reserveDailyUsage.mockResolvedValue(reservation);

      expect(await (await GET(request("walk", "10"))).json()).toEqual({
        ok: false,
        reason,
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it("uses the dedicated breaker before a reservation or fetch", async () => {
    mocks.runtimeEnabled.mockReturnValue(false);

    expect(await (await GET(request("walk", "10"))).json()).toEqual({
      ok: false,
      reason: "disabled",
    });
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
