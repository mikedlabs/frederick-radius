import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  isRateLimited: vi.fn(),
  isSameOriginRequest: vi.fn(),
  meterUsage: vi.fn(),
  routeCache: new Map<string, unknown>(),
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      const cacheKey = JSON.stringify(args);
      if (mocks.routeCache.has(cacheKey)) {
        return mocks.routeCache.get(cacheKey);
      }
      const value = await fn(...args);
      mocks.routeCache.set(cacheKey, value);
      return value;
    },
}));

vi.mock("@/lib/mapbox-server", () => ({
  MAPBOX_SERVER_TOKEN: "test-mapbox-token",
  MAPBOX_SERVER_HEADERS: { Referer: "https://frederickradius.app/" },
}));

vi.mock("@/lib/origin-check", () => ({
  isRateLimited: mocks.isRateLimited,
  isSameOriginRequest: mocks.isSameOriginRequest,
}));

vi.mock("@/lib/usage-meter", () => ({
  meterUsage: mocks.meterUsage,
}));

import { GET } from "./route";

const BASE_QUERY =
  "olng=-77.41049&olat=39.41437&dlng=-77.40712&dlat=39.41601";

function request(extra = "") {
  return new NextRequest(
    `https://frederickradius.app/api/walk-time?${BASE_QUERY}${extra}`,
  );
}

function mapboxResponse(route: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ code: "Ok", routes: [route] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("/api/walk-time routed geometry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeCache.clear();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("preserves the legacy response and overview=false by default", async () => {
    mocks.fetch.mockResolvedValue(
      mapboxResponse({
        duration: 301,
        distance: 412.4,
        geometry: {
          type: "LineString",
          coordinates: [
            [-77.41, 39.414],
            [-77.40712, 39.41601],
          ],
        },
      }),
    );

    const response = await GET(request());

    expect(await response.json()).toEqual({
      ok: true,
      minutes: 5,
      meters: 412,
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining("overview=false"),
      expect.any(Object),
    );
    expect(String(mocks.fetch.mock.calls[0]?.[0])).not.toContain("geometries=");
    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_directions");
  });

  it("requests simplified GeoJSON and returns compact coordinates on opt-in", async () => {
    mocks.fetch.mockResolvedValue(
      mapboxResponse({
        duration: 359,
        distance: 487.8,
        geometry: {
          type: "LineString",
          coordinates: [
            [-77.4104912, 39.4143712],
            [-77.4104911, 39.4143711],
            [-77.4087654, 39.4156789],
            [-77.4071234, 39.4160123],
          ],
        },
      }),
    );

    const response = await GET(request("&geometry=1"));

    expect(await response.json()).toEqual({
      ok: true,
      minutes: 6,
      meters: 488,
      coordinates: [
        [-77.41049, 39.41437],
        [-77.40877, 39.41568],
        [-77.40712, 39.41601],
      ],
    });
    const upstream = String(mocks.fetch.mock.calls[0]?.[0]);
    expect(upstream).toContain("overview=simplified");
    expect(upstream).toContain("geometries=geojson");
    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_directions");
  });

  it("keeps timing success fail-soft when optional geometry is unusable", async () => {
    mocks.fetch.mockResolvedValue(
      mapboxResponse({
        duration: 240,
        distance: 320,
        geometry: {
          type: "LineString",
          coordinates: [["bad", "coords"]],
        },
      }),
    );

    expect(await (await GET(request("&geometry=1"))).json()).toEqual({
      ok: true,
      minutes: 4,
      meters: 320,
    });
  });

  it("does not meter malformed requests that never reach Mapbox", async () => {
    const response = await GET(
      new NextRequest(
        "https://frederickradius.app/api/walk-time?olng=bad&olat=39.41437&dlng=-77.40712&dlat=39.41601",
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.meterUsage).not.toHaveBeenCalled();
  });

  it("meters an upstream attempt even when Mapbox rejects it", async () => {
    mocks.fetch.mockResolvedValue(new Response("nope", { status: 429 }));

    expect(await (await GET(request())).json()).toEqual({
      ok: false,
      reason: "upstream-429",
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_directions");
  });

  it("does not remeter a routed leg served from cache", async () => {
    mocks.fetch.mockResolvedValue(
      mapboxResponse({ duration: 301, distance: 412.4 }),
    );

    await GET(request());
    await GET(request());

    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_directions");
  });
});
