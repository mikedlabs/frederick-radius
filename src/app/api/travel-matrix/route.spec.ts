import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  isRateLimited: vi.fn(),
  isSameOriginRequest: vi.fn(),
  meterUsage: vi.fn(),
  stableCache: new Map<string, unknown>(),
  trafficCache: new Map<string, unknown>(),
  cacheCall: 0,
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>) => {
      const call = mocks.cacheCall++;
      const cache = call === 0 ? mocks.stableCache : mocks.trafficCache;
      return async (...args: unknown[]) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);
        const value = await fn(...args);
        cache.set(key, value);
        return value;
      };
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

const DESTINATIONS = [
  "place:coffee,-77.407,39.416",
  "amenity:bench-1,-77.405,39.413",
];

function request({
  mode = "walk",
  olng = "-77.411",
  olat = "39.414",
  destinations = DESTINATIONS,
}: {
  mode?: string;
  olng?: string;
  olat?: string;
  destinations?: string[];
} = {}) {
  const params = new URLSearchParams({ olng, olat, mode });
  destinations.forEach((destination) => params.append("d", destination));
  return new NextRequest(
    `https://frederickradius.app/api/travel-matrix?${params.toString()}`,
    { headers: { Referer: "https://frederickradius.app/radius" } },
  );
}

function matrixResponse(durations: Array<number | null>) {
  return Response.json({ code: "Ok", durations: [durations] });
}

describe("/api/travel-matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stableCache.clear();
    mocks.trafficCache.clear();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("returns routed walking minutes and meters by Matrix element", async () => {
    mocks.fetch.mockResolvedValue(matrixResponse([301, null]));

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      mode: "walk",
      durations: { "place:coffee": 5 },
    });
    const upstream = String(mocks.fetch.mock.calls[0]?.[0]);
    expect(upstream).toContain("/walking/-77.411,39.414;");
    expect(upstream).toContain("sources=0");
    expect(upstream).toContain("destinations=1;2");
    expect(upstream).toContain("annotations=duration");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    );
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_matrix", 2);
  });

  it("uses driving-traffic and a five-minute cache", async () => {
    mocks.fetch.mockResolvedValue(matrixResponse([540, 660]));

    const response = await GET(request({ mode: "drive" }));

    expect(String(mocks.fetch.mock.calls[0]?.[0])).toContain(
      "/driving-traffic/",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300, stale-while-revalidate=300",
    );
  });

  it("canonicalizes an exact origin before any paid work", async () => {
    const response = await GET(
      request({ olng: "-77.41062", olat: "39.41437" }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("olng=-77.411");
    expect(response.headers.get("location")).toContain("olat=39.414");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.meterUsage).not.toHaveBeenCalled();
  });

  it.each([
    [["place:one,-77.407,39.416"], "bad-destination-count"],
    [
      Array.from(
        { length: 10 },
        (_, index) => `place:p-${index},-77.40,39.41`,
      ),
      "bad-destination-count",
    ],
    [
      [
        "place:safe,-77.407,39.416",
        "place:outside,-76.9,39.416",
      ],
      "out-of-county",
    ],
    [
      [
        "place:same,-77.407,39.416",
        "place:same,-77.405,39.413",
      ],
      "duplicate-destinations",
    ],
  ])(
    "rejects an invalid destination set before Mapbox",
    async (destinations, reason) => {
      const response = await GET(request({ destinations }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, reason });
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.meterUsage).not.toHaveBeenCalled();
    },
  );

  it("does not re-fetch or re-meter a stable shortlist served from cache", async () => {
    mocks.fetch.mockResolvedValue(matrixResponse([301, 420]));

    await GET(request());
    await GET(request());

    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_matrix", 2);
  });

  it("blocks foreign and rate-limited requests before Mapbox", async () => {
    mocks.isSameOriginRequest.mockReturnValue(false);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.isRateLimited).not.toHaveBeenCalled();

    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(true);
    expect((await GET(request())).status).toBe(429);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("fails soft when Mapbox rejects a valid request", async () => {
    mocks.fetch.mockResolvedValue(new Response("no", { status: 429 }));

    expect(await (await GET(request())).json()).toEqual({
      ok: false,
      reason: "upstream-429",
    });
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_matrix", 2);
  });
});
