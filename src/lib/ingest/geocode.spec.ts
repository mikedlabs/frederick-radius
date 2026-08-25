import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usageMocks = vi.hoisted(() => ({
  finalizeIdempotentDailyUsage: vi.fn(),
  reserveIdempotentDailyUsage: vi.fn(),
}));

vi.mock("@/lib/usage-meter", () => usageMocks);

import {
  geocodeLimitForRemaining,
  googleGeocode,
  parseGoogleGeocodeResponse,
  trustedCachedCoordinate,
  VERIFIED_CATALOG_CACHE_SOURCE,
  VERIFIED_FREDERICK_COUNTY_CACHE_SOURCE,
  VERIFIED_GOOGLE_CACHE_SOURCE,
} from "@/lib/ingest/geocode";

describe("geocodeLimitForRemaining", () => {
  it("turns remaining route time into a bounded worst-case batch", () => {
    expect(geocodeLimitForRemaining(4_999, 800)).toBe(0);
    expect(geocodeLimitForRemaining(13_620, 800)).toBe(0);
    expect(geocodeLimitForRemaining(16_620, 800)).toBe(1);
    expect(geocodeLimitForRemaining(45_000, 800)).toBe(3);
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
  it("keeps catalog rows durable and revalidates official County rows", () => {
    const coordinate = { lat: 39.4137, lng: -77.4109 };
    const now = Date.parse("2026-08-23T18:00:00.000Z");
    expect(
      trustedCachedCoordinate({
        ...coordinate,
        source: VERIFIED_CATALOG_CACHE_SOURCE,
      }),
    ).toEqual(coordinate);
    expect(
      trustedCachedCoordinate({
        ...coordinate,
        source: VERIFIED_FREDERICK_COUNTY_CACHE_SOURCE,
        cached_at: "2026-08-01T18:00:00.000Z",
      }, now),
    ).toEqual(coordinate);
    expect(
      trustedCachedCoordinate({
        ...coordinate,
        source: VERIFIED_FREDERICK_COUNTY_CACHE_SOURCE,
        cached_at: "2026-07-01T18:00:00.000Z",
      }, now),
    ).toBeNull();
    expect(
      trustedCachedCoordinate({
        ...coordinate,
        source: VERIFIED_FREDERICK_COUNTY_CACHE_SOURCE,
      }, now),
    ).toBeNull();
  });

  it("accepts only current Google rows with a plausible cache timestamp", () => {
    const coordinate = { lat: 39.4137, lng: -77.4109 };
    const now = Date.parse("2026-08-23T18:00:00.000Z");

    expect(
      trustedCachedCoordinate(
        {
          ...coordinate,
          source: VERIFIED_GOOGLE_CACHE_SOURCE,
          cached_at: "2026-08-01T18:00:00.000Z",
        },
        now,
      ),
    ).toEqual(coordinate);
    expect(
      trustedCachedCoordinate(
        {
          ...coordinate,
          source: VERIFIED_GOOGLE_CACHE_SOURCE,
          cached_at: "2026-07-01T18:00:00.000Z",
        },
        now,
      ),
    ).toBeNull();
    expect(
      trustedCachedCoordinate(
        {
          ...coordinate,
          source: VERIFIED_GOOGLE_CACHE_SOURCE,
          cached_at: "2026-08-23T18:06:00.000Z",
        },
        now,
      ),
    ).toBeNull();
    expect(
      trustedCachedCoordinate(
        { ...coordinate, source: VERIFIED_GOOGLE_CACHE_SOURCE },
        now,
      ),
    ).toBeNull();
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
    vi.clearAllMocks();
    process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL =
      "written-google-authorization-confirmed";
    process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED = "1";
    usageMocks.reserveIdempotentDailyUsage.mockResolvedValue({
      reserved: true,
      count: 1,
      duplicate: false,
    });
    usageMocks.finalizeIdempotentDailyUsage.mockResolvedValue({
      finalized: true,
      state: "succeeded",
    });
  });

  afterEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_GEOCODING_API_KEY;
    delete process.env.GOOGLE_GEOCODING_ENABLED;
    delete process.env.GOOGLE_EVENT_GEOCODE_DAILY_LIMIT;
    delete process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL;
    delete process.env.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns disabled when a Places key exists but geocoding was not enabled", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays disabled when the switch is on but only the broad Places key exists", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-places-key";
    process.env.GOOGLE_GEOCODING_ENABLED = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays disabled when the dedicated Geocoding credential is blank", async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = "   ";
    process.env.GOOGLE_GEOCODING_ENABLED = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays disabled with a dedicated key and switch but no written approval", async () => {
    delete process.env.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL;
    process.env.GOOGLE_GEOCODING_API_KEY = "test-geocoding-key";
    process.env.GOOGLE_GEOCODING_ENABLED = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses only the dedicated Geocoding credential", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-places-key";
    process.env.GOOGLE_GEOCODING_API_KEY = "test-geocoding-key";
    process.env.GOOGLE_GEOCODING_ENABLED = "1";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleGeocode("1 N Market St, Frederick, MD")).resolves.toEqual({
      kind: "reject",
      reason: "zero-results",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestUrl] = fetchMock.mock.calls[0] as [string];
    expect(requestUrl).toContain("key=test-geocoding-key");
    expect(requestUrl).not.toContain("test-places-key");
    expect(usageMocks.reserveIdempotentDailyUsage).toHaveBeenCalledWith(
      "google_event_geocode",
      25,
      "1 n market st frederick md",
    );
    expect(
      usageMocks.reserveIdempotentDailyUsage.mock.invocationCallOrder[0],
    ).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(usageMocks.finalizeIdempotentDailyUsage).toHaveBeenCalledWith(
      "google_event_geocode",
      "1 n market st frederick md",
      "succeeded",
    );
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      usageMocks.finalizeIdempotentDailyUsage.mock.invocationCallOrder[0],
    );
  });

  it.each([
    { reservation: null, reason: "budget-unavailable" },
    {
      reservation: { reserved: false, count: 25, duplicate: false },
      reason: "daily-cap",
    },
    {
      reservation: { reserved: false, count: 1, duplicate: true },
      reason: "already-reserved",
    },
  ] as const)(
    "fails closed as $reason without calling Google",
    async ({ reservation, reason }) => {
      process.env.GOOGLE_GEOCODING_API_KEY = "test-geocoding-key";
      process.env.GOOGLE_GEOCODING_ENABLED = "1";
      usageMocks.reserveIdempotentDailyUsage.mockResolvedValueOnce(reservation);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        googleGeocode("1 N Market St, Frederick, MD"),
      ).resolves.toEqual({ kind: "budget", reason });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(usageMocks.finalizeIdempotentDailyUsage).not.toHaveBeenCalled();
    },
  );

  it("allows an explicit zero to disable paid geocoding before reservation", async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = "test-geocoding-key";
    process.env.GOOGLE_GEOCODING_ENABLED = "1";
    process.env.GOOGLE_EVENT_GEOCODE_DAILY_LIMIT = "0";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      googleGeocode("1 N Market St, Frederick, MD"),
    ).resolves.toEqual({ kind: "budget", reason: "budget-disabled" });
    expect(usageMocks.reserveIdempotentDailyUsage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies HTTP quota failures as system outcomes", async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
    process.env.GOOGLE_GEOCODING_ENABLED = "1";
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
    expect(usageMocks.finalizeIdempotentDailyUsage).toHaveBeenCalledWith(
      "google_event_geocode",
      "1 n market st frederick md",
      "failed",
    );
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
      process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
      process.env.GOOGLE_GEOCODING_ENABLED = "1";
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
    process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
    process.env.GOOGLE_GEOCODING_ENABLED = "1";
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
    process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
    process.env.GOOGLE_GEOCODING_ENABLED = "1";
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
