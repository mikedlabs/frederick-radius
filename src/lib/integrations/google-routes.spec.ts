import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
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

vi.mock("@/lib/usage-meter", () => ({
  meterUsage: mocks.meterUsage,
}));

import {
  computeMatrix,
  computePrivateMatrix,
  travelTimes,
} from "./google-routes";

const ORIGIN = { lat: 39.4143, lng: -77.4105 };
const DESTINATION = { lat: 39.416, lng: -77.4071 };

function matrixResponse(
  rows: Array<Record<string, unknown>>,
  status = 200,
) {
  return new Response(JSON.stringify(rows), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Google Routes usage metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeCache.clear();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-google-key");
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips both Google and the meter when configuration is missing", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");

    await expect(
      computeMatrix(ORIGIN, [DESTINATION], "WALK"),
    ).resolves.toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.meterUsage).not.toHaveBeenCalled();
  });

  it("skips both Google and the meter when there are no destinations", async () => {
    await expect(computeMatrix(ORIGIN, [], "WALK")).resolves.toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.meterUsage).not.toHaveBeenCalled();
  });

  it("meters each valid Compute Route Matrix request at the fetch boundary", async () => {
    mocks.fetch.mockResolvedValue(
      matrixResponse([
        {
          destinationIndex: 0,
          duration: "732s",
          distanceMeters: 1840,
          condition: "ROUTE_EXISTS",
        },
      ]),
    );

    await expect(
      computeMatrix(ORIGIN, [DESTINATION], "DRIVE"),
    ).resolves.toEqual([
      { destinationIndex: 0, duration: 732, meters: 1840 },
    ]);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith("google_routes_matrix");

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    });
  });

  it("still meters a request that Google rejects", async () => {
    mocks.fetch.mockResolvedValue(matrixResponse([], 429));

    await expect(
      computeMatrix(ORIGIN, [DESTINATION], "WALK"),
    ).resolves.toEqual([]);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith("google_routes_matrix");
  });

  it("records both 1x1 matrices used for walk and drive travel times", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        matrixResponse([
          {
            destinationIndex: 0,
            duration: "600s",
            distanceMeters: 900,
            condition: "ROUTE_EXISTS",
          },
        ]),
      )
      .mockResolvedValueOnce(
        matrixResponse([
          {
            destinationIndex: 0,
            duration: "240s",
            distanceMeters: 2100,
            condition: "ROUTE_EXISTS",
          },
        ]),
      );

    await expect(travelTimes(ORIGIN, DESTINATION)).resolves.toEqual({
      walkMin: 10,
      driveMin: 4,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.meterUsage).toHaveBeenCalledTimes(2);
    expect(mocks.meterUsage).toHaveBeenNthCalledWith(
      1,
      "google_routes_matrix",
    );
    expect(mocks.meterUsage).toHaveBeenNthCalledWith(
      2,
      "google_routes_matrix",
    );
  });

  it("does not remeter a matrix served from the one-hour cache", async () => {
    mocks.fetch.mockResolvedValue(
      matrixResponse([
        {
          destinationIndex: 0,
          duration: "600s",
          distanceMeters: 900,
          condition: "ROUTE_EXISTS",
        },
      ]),
    );

    await computeMatrix(ORIGIN, [DESTINATION], "WALK");
    await computeMatrix(ORIGIN, [DESTINATION], "WALK");

    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledOnce();
    expect(mocks.meterUsage).toHaveBeenCalledWith("google_routes_matrix");
  });

  it("never persists a user-specific origin in the application route cache", async () => {
    mocks.fetch.mockResolvedValue(
      matrixResponse([{
        destinationIndex: 0,
        duration: "600s",
        distanceMeters: 900,
        condition: "ROUTE_EXISTS",
      }]),
    );

    await computePrivateMatrix(ORIGIN, [DESTINATION], "WALK");
    await computePrivateMatrix(ORIGIN, [DESTINATION], "WALK");

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.routeCache.size).toBe(0);
  });
});
