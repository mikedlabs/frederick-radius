import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usageMocks = vi.hoisted(() => ({
  meterUsage: vi.fn(),
  reserveDailyUsage: vi.fn(),
}));

vi.mock("@/lib/usage-meter", () => ({
  meterUsage: usageMocks.meterUsage,
  reserveDailyUsage: usageMocks.reserveDailyUsage,
}));

import {
  geocodeLimitForRemaining,
  googleGeocode,
  parseGoogleGeocodeResponse,
  resolveGoogleGeocodeDailyCap,
  trustedCachedCoordinate,
  VERIFIED_CATALOG_CACHE_SOURCE,
  VERIFIED_GOOGLE_CACHE_SOURCE,
} from "@/lib/ingest/geocode";

describe("resolveGoogleGeocodeDailyCap", () => {
  it("uses a safe default and never lets an environment value exceed the hard cap", () => {
    expect(resolveGoogleGeocodeDailyCap()).toBe(50);
    expect(resolveGoogleGeocodeDailyCap("17")).toBe(17);
    expect(resolveGoogleGeocodeDailyCap("100")).toBe(100);
    expect(resolveGoogleGeocodeDailyCap("101")).toBe(100);
    expect(resolveGoogleGeocodeDailyCap("9999")).toBe(100);
    expect(resolveGoogleGeocodeDailyCap("0")).toBe(50);
    expect(resolveGoogleGeocodeDailyCap("not-a-number")).toBe(50);
  });
});

describe("geocodeLimitForRemaining", () => {
  it("turns remaining route time into a bounded worst-case batch", () => {
    expect(geocodeLimitForRemaining(4_999, 800)).toBe(0);
    expect(geocodeLimitForRemaining(13_620, 800)).toBe(1);
    expect(geocodeLimitForRemaining(45_000, 800)).toBe(4);
    expect(geocodeLimitForRemaining(1_000_000, 3)).toBe(3);
  });

  it("rejects invalid route budgets and limits", () => {
    expect(geocodeLimitForRemaining(Number.NaN, 800)).toBe(0);
    expect(geocodeLimitForRemaining(50_000, Number.POSITIVE_INFINITY)).toBe(0);
    expect(geocodeLimitForRemaining(50_000, -1)).toBe(0);
  });
});

function result(
  lng: number,
  lat: number,
  options: {
    types?: string[];
    locationType?: string;
    partialMatch?: boolean;
  } = {},
) {
  return {
    partial_match: options.partialMatch,
    types: options.types ?? ["street_address"],
    geometry: {
      location: { lat, lng },
      location_type: options.locationType ?? "ROOFTOP",
    },
  };
}

function response(...results: unknown[]) {
  return { status: "OK", results };
}

describe("parseGoogleGeocodeResponse", () => {
  it("accepts precise in-county address results", () => {
    expect(
      parseGoogleGeocodeResponse(response(result(-77.4109, 39.4137))),
    ).toEqual({
      kind: "match",
      coordinate: { lng: -77.4109, lat: 39.4137 },
    });

    expect(
      parseGoogleGeocodeResponse(
        response(
          result(-77.4145, 39.4157, {
            locationType: "RANGE_INTERPOLATED",
          }),
        ),
      ),
    ).toEqual({
      kind: "match",
      coordinate: { lng: -77.4145, lat: 39.4157 },
    });
  });

  it("preserves legitimate venue and park results", () => {
    expect(
      parseGoogleGeocodeResponse(
        response(
          result(-77.412, 39.414, {
            types: ["establishment", "point_of_interest"],
            locationType: "GEOMETRIC_CENTER",
          }),
        ),
      ),
    ).toEqual({
      kind: "match",
      coordinate: { lng: -77.412, lat: 39.414 },
    });

    expect(
      parseGoogleGeocodeResponse(
        response(
          result(-77.419, 39.421, {
            types: ["park", "point_of_interest"],
            locationType: "GEOMETRIC_CENTER",
          }),
        ),
      ),
    ).toEqual({
      kind: "match",
      coordinate: { lng: -77.419, lat: 39.421 },
    });
  });

  it("rejects results outside the Frederick County boundary", () => {
    expect(
      parseGoogleGeocodeResponse(response(result(-76.6122, 39.2904))),
    ).toEqual({ kind: "reject", reason: "outside-county" });

    // Smithsburg is inside the coarse bbox but outside the county polygon.
    expect(
      parseGoogleGeocodeResponse(response(result(-77.5728, 39.6551))),
    ).toEqual({ kind: "reject", reason: "outside-county" });
  });

  it("rejects area centroids, approximate geometry, and partial matches", () => {
    expect(
      parseGoogleGeocodeResponse(
        response(
          result(-77.4109, 39.4137, {
            types: ["locality", "political"],
          }),
        ),
      ),
    ).toEqual({ kind: "reject", reason: "unsupported-address" });
    expect(
      parseGoogleGeocodeResponse(
        response(
          result(-77.4109, 39.4137, {
            locationType: "APPROXIMATE",
          }),
        ),
      ),
    ).toEqual({ kind: "reject", reason: "imprecise" });
    expect(
      parseGoogleGeocodeResponse(
        response(result(-77.4109, 39.4137, { partialMatch: true })),
      ),
    ).toEqual({ kind: "reject", reason: "partial-match" });
  });

  it("continues past an unusable first result to a valid venue result", () => {
    const parsed = parseGoogleGeocodeResponse(
      response(
        result(-77.4109, 39.4137, {
          types: ["postal_code"],
          locationType: "APPROXIMATE",
        }),
        result(-77.4145, 39.4157, {
          types: ["premise", "establishment"],
          locationType: "ROOFTOP",
        }),
      ),
    );
    expect(parsed).toEqual({
      kind: "match",
      coordinate: { lng: -77.4145, lat: 39.4157 },
    });
  });

  it("does not fish for an in-county match after a precise outside-county result", () => {
    expect(
      parseGoogleGeocodeResponse(
        response(
          result(-76.6122, 39.2904),
          result(-77.4145, 39.4157),
        ),
      ),
    ).toEqual({ kind: "reject", reason: "outside-county" });
  });

  it("separates definitive misses from system responses", () => {
    expect(parseGoogleGeocodeResponse(null)).toEqual({
      kind: "system",
      reason: "malformed-response",
    });
    expect(
      parseGoogleGeocodeResponse({ status: "ZERO_RESULTS", results: [] }),
    ).toEqual({ kind: "reject", reason: "zero-results" });
    expect(
      parseGoogleGeocodeResponse({ status: "OVER_QUERY_LIMIT", results: [] }),
    ).toEqual({
      kind: "system",
      reason: "quota",
      status: "OVER_QUERY_LIMIT",
    });
    expect(parseGoogleGeocodeResponse({ status: "OK", results: [{}] })).toEqual({
      kind: "reject",
      reason: "unsupported-address",
    });
  });
});

describe("trustedCachedCoordinate", () => {
  it("accepts county-valid verified catalog and Google rows", () => {
    const coordinate = { lat: 39.4137, lng: -77.4109 };
    expect(
      trustedCachedCoordinate({
        ...coordinate,
        source: VERIFIED_CATALOG_CACHE_SOURCE,
      }),
    ).toEqual(coordinate);
    expect(
      trustedCachedCoordinate({
        ...coordinate,
        source: VERIFIED_GOOGLE_CACHE_SOURCE,
      }),
    ).toEqual(coordinate);
  });

  it("forces legacy Google and curated rows through a current trust path", () => {
    for (const source of ["google", "curated"]) {
      expect(
        trustedCachedCoordinate({
          lat: 39.4137,
          lng: -77.4109,
          source,
        }),
      ).toBeNull();
    }
  });

  it("never trusts an out-of-county cached coordinate", () => {
    expect(
      trustedCachedCoordinate({
        lat: 39.2904,
        lng: -76.6122,
        source: VERIFIED_CATALOG_CACHE_SOURCE,
      }),
    ).toBeNull();
  });
});

describe("googleGeocode network boundary", () => {
  beforeEach(() => {
    usageMocks.meterUsage.mockReset();
    usageMocks.reserveDailyUsage.mockReset();
    usageMocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
  });

  afterEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_GEOCODING_API_KEY;
    delete process.env.GOOGLE_GEOCODE_DAILY_CAP;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns disabled without a key or network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usageMocks.reserveDailyUsage).not.toHaveBeenCalled();
  });

  it("fails closed without a provider call when the shared daily cap is exhausted", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    process.env.GOOGLE_GEOCODE_DAILY_CAP = "7";
    usageMocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 7 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "system",
      reason: "daily-budget",
    });
    expect(usageMocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_geocode",
      7,
    );
    expect(usageMocks.meterUsage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed without a provider call when the atomic reservation is unavailable", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    usageMocks.reserveDailyUsage.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "system",
      reason: "daily-budget",
    });
    expect(usageMocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_geocode",
      50,
    );
    expect(usageMocks.meterUsage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers a dedicated Geocoding API key while retaining the shared-key fallback", async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = "dedicated-key";
    process.env.GOOGLE_PLACES_API_KEY = "shared-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "reject",
      reason: "zero-results",
    });
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("key=dedicated-key");
    expect(requestedUrl).not.toContain("shared-key");
    expect(usageMocks.reserveDailyUsage.mock.invocationCallOrder[0]).toBeLessThan(
      usageMocks.meterUsage.mock.invocationCallOrder[0],
    );
    expect(usageMocks.meterUsage.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
  });

  it("classifies HTTP quota failures as system outcomes", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "OVER_QUERY_LIMIT", results: [] }), {
          status: 429,
        }),
      ),
    );

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "system",
      reason: "quota",
      status: 429,
    });
    expect(usageMocks.reserveDailyUsage).toHaveBeenCalledWith(
      "budget_google_geocode",
      50,
    );
    expect(usageMocks.meterUsage).toHaveBeenCalledWith("google_geocode");
  });

  it.each([
    {
      httpStatus: 403,
      apiStatus: "REQUEST_DENIED",
      reason: "auth",
    },
    {
      httpStatus: 503,
      apiStatus: "UNKNOWN_ERROR",
      reason: "upstream",
    },
  ] as const)(
    "classifies $reason provider failures as system outcomes",
    async ({ httpStatus, apiStatus, reason }) => {
      process.env.GOOGLE_PLACES_API_KEY = "test-key";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ status: apiStatus, results: [] }), {
            status: httpStatus,
          }),
        ),
      );

      await expect(
        googleGeocode("1 N Market St, Frederick, MD"),
      ).resolves.toEqual({
        kind: "system",
        reason,
        status: httpStatus,
      });
    },
  );

  it("classifies a network rejection without turning it into an address miss", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network unavailable")),
    );

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "system",
      reason: "network",
    });
  });

  it("aborts an upstream request after eight seconds", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
      ),
    );

    const pending = googleGeocode("1 N Market St, Frederick, MD");
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toEqual({
      kind: "system",
      reason: "timeout",
    });
  });
});
