import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getMapboxTravelMatrix: vi.fn(),
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

vi.mock("@/lib/integrations/mapboxMatrix", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/integrations/mapboxMatrix")
  >("@/lib/integrations/mapboxMatrix");
  return {
    ...actual,
    getMapboxTravelMatrix: mocks.getMapboxTravelMatrix,
  };
});

vi.mock("@/lib/origin-check", async () => {
  const actual = await vi.importActual<typeof import("@/lib/origin-check")>(
    "@/lib/origin-check",
  );
  return {
    ...actual,
    isRateLimited: mocks.isRateLimited,
    isSameOriginRequest: mocks.isSameOriginRequest,
  };
});

vi.mock("@/lib/usage-meter", () => ({
  meterUsage: mocks.meterUsage,
}));

import { GET, POST } from "./route";

const DESTINATIONS = [
  "place:coffee,-77.407,39.416",
  "amenity:bench-1,-77.405,39.413",
];

function getRequest({
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

    const response = await GET(getRequest());

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

    const response = await GET(getRequest({ mode: "drive" }));

    expect(String(mocks.fetch.mock.calls[0]?.[0])).toContain(
      "/driving-traffic/",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300, stale-while-revalidate=300",
    );
  });

  it("canonicalizes an exact origin before any paid work", async () => {
    const response = await GET(
      getRequest({ olng: "-77.41062", olat: "39.41437" }),
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
      const response = await GET(getRequest({ destinations }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, reason });
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.meterUsage).not.toHaveBeenCalled();
    },
  );

  it("does not re-fetch or re-meter a stable shortlist served from cache", async () => {
    mocks.fetch.mockResolvedValue(matrixResponse([301, 420]));

    await GET(getRequest());
    await GET(getRequest());

    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_matrix", 2);
  });

  it("blocks foreign and rate-limited requests before Mapbox", async () => {
    mocks.isSameOriginRequest.mockReturnValue(false);
    expect((await GET(getRequest())).status).toBe(403);
    expect(mocks.isRateLimited).not.toHaveBeenCalled();

    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(true);
    expect((await GET(getRequest())).status).toBe(429);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("fails soft when Mapbox rejects a valid request", async () => {
    mocks.fetch.mockResolvedValue(new Response("no", { status: 429 }));

    expect(await (await GET(getRequest())).json()).toEqual({
      ok: false,
      reason: "upstream-429",
    });
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_matrix", 2);
  });
});

const BODY = {
  profile: "walking",
  origin: { lng: -77.41049, lat: 39.41437 },
  destinations: [
    { lng: -77.40712, lat: 39.41601 },
    { lng: -77.41674, lat: 39.41272 },
  ],
};

function postRequest(
  body: unknown = BODY,
  options: {
    origin?: string;
    contentType?: string;
    contentLength?: string;
  } = {},
) {
  const headers = new Headers({
    origin: options.origin ?? "https://frederickradius.app",
    "content-type": options.contentType ?? "application/json",
  });
  if (options.contentLength) {
    headers.set("content-length", options.contentLength);
  }
  return new NextRequest("https://frederickradius.app/api/travel-matrix", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/travel-matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.getMapboxTravelMatrix.mockResolvedValue({
      ok: true,
      profile: "walking",
      origin: { lng: -77.41, lat: 39.414 },
      legs: [],
    });
  });

  it("normalizes the explicit body before calling the paid service", async () => {
    const response = await POST(postRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.getMapboxTravelMatrix).toHaveBeenCalledWith({
      profile: "walking",
      origin: { lng: -77.41, lat: 39.414 },
      destinations: [
        { lng: -77.407, lat: 39.416 },
        { lng: -77.417, lat: 39.413 },
      ],
    });
  });

  it("rejects a foreign browser origin before spending upstream", async () => {
    const response = await POST(
      postRequest(BODY, { origin: "https://example.com" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "forbidden-origin",
    });
    expect(mocks.getMapboxTravelMatrix).not.toHaveBeenCalled();
  });

  it("requires JSON and caps the body before parsing", async () => {
    const unsupported = await POST(
      postRequest(BODY, { contentType: "text/plain" }),
    );
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toEqual({
      ok: false,
      reason: "unsupported-media-type",
    });

    const oversized = await POST(
      postRequest(BODY, { contentLength: String(4 * 1024 + 1) }),
    );
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({
      ok: false,
      reason: "body-too-large",
    });
    expect(mocks.getMapboxTravelMatrix).not.toHaveBeenCalled();
  });

  it("returns clear validation errors without calling Mapbox", async () => {
    const response = await POST(
      postRequest({ ...BODY, destinations: [BODY.destinations[0]] }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "too-few-destinations",
    });
    expect(mocks.getMapboxTravelMatrix).not.toHaveBeenCalled();
  });

  it("rate-limits the paid endpoint before reading the body", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const response = await POST(postRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({
      ok: false,
      reason: "rate-limited",
    });
    expect(mocks.getMapboxTravelMatrix).not.toHaveBeenCalled();
  });

  it("keeps an upstream failure fail-soft and structured", async () => {
    mocks.getMapboxTravelMatrix.mockResolvedValue({
      ok: false,
      reason: "upstream-timeout",
      retryable: true,
    });

    const response = await POST(postRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "upstream-timeout",
      retryable: true,
    });
  });
});
