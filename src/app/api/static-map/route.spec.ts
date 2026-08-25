import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  isRateLimited: vi.fn(),
  isSameOriginRequest: vi.fn(),
  reserveDailyUsage: vi.fn(),
  runtimeEnabled: vi.fn(),
  routeCache: new Map<string, unknown>(),
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>, keys: string[]) =>
    async (...args: unknown[]) => {
      const cacheKey = JSON.stringify([keys, args]);
      if (mocks.routeCache.has(cacheKey)) {
        return mocks.routeCache.get(cacheKey);
      }
      const value = await fn(...args);
      mocks.routeCache.set(cacheKey, value);
      return value;
    },
}));

vi.mock("@/lib/mapbox-server", () => ({
  MAPBOX_SERVER_TOKEN: "test-server-token",
  MAPBOX_SERVER_HEADERS: { Referer: "https://frederickradius.app/" },
}));

vi.mock("@/lib/mapbox-budget", () => ({
  mapboxDailyUsageCap: () => 500,
  mapboxRequestRuntimeEnabled: mocks.runtimeEnabled,
}));

vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginRequest: mocks.isSameOriginRequest,
  isOverPaidRequestBudget: (
    req: Request,
    key: string,
    limit: number,
    windowSeconds: number,
  ) => mocks.isRateLimited(req, key, limit, windowSeconds),
}));

import { GET } from "./route";

function request(query = "lng=-77.4105&lat=39.4144") {
  return new NextRequest(
    `https://frederickradius.app/api/static-map?${query}`,
  );
}

describe("Mapbox static-map route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeCache.clear();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.runtimeEnabled.mockReturnValue(true);
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
    mocks.fetch.mockResolvedValue(
      new Response(Uint8Array.from([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" },
      }),
    );
  });

  it("reserves one request immediately before an uncached Static Images call", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe("4");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      Uint8Array.from([137, 80, 78, 71]),
    );
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("mapbox_static", 500);
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining("access_token=test-server-token"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("serves a repeated locator from cache without another reservation", async () => {
    await GET(request());
    await GET(request());

    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    [null, 503],
    [{ reserved: false, count: 500 }, 503],
  ])(
    "fails closed before Mapbox when reservation is %j",
    async (reservation, status) => {
      mocks.reserveDailyUsage.mockResolvedValue(reservation);

      const response = await GET(request());

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it("uses the Static Images breaker before a reservation or fetch", async () => {
    mocks.runtimeEnabled.mockReturnValue(false);

    expect((await GET(request())).status).toBe(503);
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed or out-of-county coordinates before cost controls", async () => {
    expect((await GET(request("lng=nope&lat=39.4144"))).status).toBe(400);
    expect((await GET(request("lng=-78&lat=39.4144"))).status).toBe(400);
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects an oversized image rather than caching an unsafe item", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("", {
        headers: {
          "content-type": "image/png",
          "content-length": "1250001",
        },
      }),
    );

    expect((await GET(request())).status).toBe(502);
  });
});
