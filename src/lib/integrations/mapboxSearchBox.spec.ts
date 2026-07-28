import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  meterUsage: vi.fn(),
}));

vi.mock("@/lib/mapbox-server", () => ({
  MAPBOX_SERVER_TOKEN: "test-mapbox-token",
  MAPBOX_SERVER_HEADERS: {
    Referer: "https://frederickradius.app/",
  },
}));

vi.mock("@/lib/usage-meter", () => ({
  meterUsage: mocks.meterUsage,
}));

import {
  normalizeMapboxSearchBoxInput,
  searchMapboxTemporary,
} from "./mapboxSearchBox";

const SESSION_TOKEN = "2d9f68fb-5d4c-4b28-9d8e-cc2e2bc6e99e";
const PROXIMITY = { lng: -77.41049, lat: 39.41437 };

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("normalizeMapboxSearchBoxInput", () => {
  it("normalizes a bounded suggest session with explicit proximity", () => {
    expect(
      normalizeMapboxSearchBoxInput({
        action: "suggest",
        q: "  Gravel   and Grind ",
        sessionToken: SESSION_TOKEN.toUpperCase(),
        sessionStart: true,
        proximity: PROXIMITY,
      }),
    ).toEqual({
      ok: true,
      value: {
        action: "suggest",
        q: "Gravel and Grind",
        sessionToken: SESSION_TOKEN,
        sessionStart: true,
        proximity: { lng: -77.41, lat: 39.414 },
        limit: 4,
      },
    });
  });

  it("accepts a bounded search-along-route polyline", () => {
    expect(
      normalizeMapboxSearchBoxInput({
        action: "suggest",
        q: "coffee",
        sessionToken: SESSION_TOKEN,
        proximity: PROXIMITY,
        limit: 2,
        route: "g`miF~s~vM_BcB",
        routeGeometry: "polyline6",
        timeDeviation: 7.26,
      }),
    ).toEqual({
      ok: true,
      value: {
        action: "suggest",
        q: "coffee",
        sessionToken: SESSION_TOKEN,
        proximity: { lng: -77.41, lat: 39.414 },
        limit: 2,
        route: "g`miF~s~vM_BcB",
        routeGeometry: "polyline6",
        timeDeviation: 7.3,
      },
    });
  });

  it("rejects missing location, non-v4 sessions, excess results, and stray route options", () => {
    expect(
      normalizeMapboxSearchBoxInput({
        action: "suggest",
        q: "coffee",
        sessionToken: "not-a-session",
        proximity: PROXIMITY,
      }),
    ).toEqual({ ok: false, reason: "invalid-session-token" });

    expect(
      normalizeMapboxSearchBoxInput({
        action: "suggest",
        q: "coffee",
        sessionToken: SESSION_TOKEN,
        proximity: { lng: -76.6, lat: 39.4 },
      }),
    ).toEqual({ ok: false, reason: "outside-county" });

    expect(
      normalizeMapboxSearchBoxInput({
        action: "suggest",
        q: "coffee",
        sessionToken: SESSION_TOKEN,
        proximity: PROXIMITY,
        limit: 5,
      }),
    ).toEqual({ ok: false, reason: "invalid-limit" });

    expect(
      normalizeMapboxSearchBoxInput({
        action: "suggest",
        q: "coffee",
        sessionToken: SESSION_TOKEN,
        proximity: PROXIMITY,
        routeGeometry: "polyline6",
      }),
    ).toEqual({ ok: false, reason: "route-required" });
  });

  it("requires an opaque but bounded Mapbox id for retrieve", () => {
    expect(
      normalizeMapboxSearchBoxInput({
        action: "retrieve",
        mapboxId: "dXJuOm1ieHBvaTpUZXN0LTE=",
        sessionToken: SESSION_TOKEN,
        proximity: PROXIMITY,
      }),
    ).toEqual({
      ok: true,
      value: {
        action: "retrieve",
        mapboxId: "dXJuOm1ieHBvaTpUZXN0LTE=",
        sessionToken: SESSION_TOKEN,
        proximity: { lng: -77.41, lat: 39.414 },
      },
    });

    expect(
      normalizeMapboxSearchBoxInput({
        action: "retrieve",
        mapboxId: "../bad id",
        sessionToken: SESSION_TOKEN,
        proximity: PROXIMITY,
      }),
    ).toEqual({ ok: false, reason: "invalid-mapbox-id" });
  });
});

describe("searchMapboxTemporary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.meterUsage.mockReset();
    process.env.MAPBOX_SEARCH_BOX_ENABLED = "1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_SEARCH_BOX_ENABLED;
  });

  it("always bounds suggestions to Frederick County and excludes closed POIs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        suggestions: [
          {
            mapbox_id: "mapbox.place.1",
            name: "Gravel <and> Grind",
            feature_type: "poi",
            full_address: "15 E 6th St\u0000, Frederick, MD",
            poi_category: ["Coffee Shop", "<script>bad</script>"],
            distance: 91.4,
          },
        ],
        attribution: "© Mapbox",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchMapboxTemporary({
      action: "suggest",
      q: "coffee and bikes",
      sessionToken: SESSION_TOKEN,
      sessionStart: true,
      proximity: { lng: -77.4105, lat: 39.4144 },
      limit: 4,
    });

    expect(result).toEqual({
      ok: true,
      action: "suggest",
      temporary: true,
      provider: "Mapbox",
      suggestions: [
        {
          mapboxId: "mapbox.place.1",
          name: "Gravel and Grind",
          featureType: "poi",
          fullAddress: "15 E 6th St , Frederick, MD",
          categories: ["Coffee Shop", "scriptbad/script"],
          distanceMeters: 91,
        },
      ],
      attribution: "© Mapbox",
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://api.mapbox.com/search/searchbox/v1/suggest",
    );
    expect(requestUrl.searchParams.get("q")).toBe("coffee and bikes");
    expect(requestUrl.searchParams.get("session_token")).toBe(SESSION_TOKEN);
    expect(requestUrl.searchParams.get("proximity")).toBe(
      "-77.41,39.414",
    );
    expect(requestUrl.searchParams.get("bbox")).toBe(
      "-77.7,39.265,-77.15,39.745",
    );
    expect(requestUrl.searchParams.get("country")).toBe("US");
    expect(requestUrl.searchParams.get("limit")).toBe("4");
    expect(requestUrl.searchParams.get("show_closed_pois")).toBe("false");
    expect(requestUrl.searchParams.get("access_token")).toBe(
      "test-mapbox-token",
    );
    expect(requestInit.cache).toBe("no-store");
    expect(requestInit.headers).toEqual({
      Referer: "https://frederickradius.app/",
    });
    expect(mocks.meterUsage).toHaveBeenCalledWith("mapbox_search_box");
  });

  it("passes bounded route search fields only when supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ suggestions: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await searchMapboxTemporary({
      action: "suggest",
      q: "coffee",
      sessionToken: SESSION_TOKEN,
      proximity: { lng: -77.4105, lat: 39.4144 },
      limit: 2,
      route: "g`miF~s~vM_BcB",
      routeGeometry: "polyline6",
      timeDeviation: 7.5,
    });

    const [requestUrl] = fetchMock.mock.calls[0] as [URL];
    expect(requestUrl.searchParams.get("sar_type")).toBe("isochrone");
    expect(requestUrl.searchParams.get("route")).toBe("g`miF~s~vM_BcB");
    expect(requestUrl.searchParams.get("route_geometry")).toBe("polyline6");
    expect(requestUrl.searchParams.get("time_deviation")).toBe("7.5");
    expect(mocks.meterUsage).not.toHaveBeenCalled();
  });

  it("retrieves only the paired county feature and sanitizes its point", async () => {
    const mapboxId = "dXJuOm1ieHBvaTpUZXN0LTE=";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [-77.4104411, 39.4143911],
            },
            properties: {
              mapbox_id: mapboxId,
              name: "A local place",
              feature_type: "poi",
              address: "1 Market St",
              coordinates: {
                routable_points: [
                  { longitude: -77.4105, latitude: 39.4143 },
                ],
              },
            },
          },
        ],
        attribution: "© Mapbox",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchMapboxTemporary({
      action: "retrieve",
      mapboxId,
      sessionToken: SESSION_TOKEN,
      proximity: { lng: -77.4105, lat: 39.4144 },
    });

    expect(result).toEqual({
      ok: true,
      action: "retrieve",
      temporary: true,
      provider: "Mapbox",
      result: {
        mapboxId,
        name: "A local place",
        featureType: "poi",
        address: "1 Market St",
        coordinates: { lng: -77.410441, lat: 39.414391 },
        routablePoint: { lng: -77.4105, lat: 39.4143 },
      },
      attribution: "© Mapbox",
    });

    const [requestUrl] = fetchMock.mock.calls[0] as [URL];
    expect(requestUrl.pathname).toBe(
      `/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`,
    );
    expect(requestUrl.searchParams.get("session_token")).toBe(SESSION_TOKEN);
    expect(requestUrl.searchParams.get("proximity")).toBe(
      "-77.41,39.414",
    );
    expect(mocks.meterUsage).not.toHaveBeenCalled();
  });

  it("drops a forged retrieve result outside Frederick County", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        type: "FeatureCollection",
        features: [
          {
            geometry: {
              type: "Point",
              coordinates: [-76.61, 39.29],
            },
            properties: {
              mapbox_id: "mapbox.place.1",
              name: "Outside result",
              feature_type: "poi",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchMapboxTemporary({
        action: "retrieve",
        mapboxId: "mapbox.place.1",
        sessionToken: SESSION_TOKEN,
        proximity: { lng: -77.4105, lat: 39.4144 },
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "outside-county",
      retryable: false,
    });
  });

  it("fails soft on timeout and stays off without an explicit cost switch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("aborted"), { name: "AbortError" }),
      ),
    );

    await expect(
      searchMapboxTemporary({
        action: "suggest",
        q: "coffee",
        sessionToken: SESSION_TOKEN,
        proximity: { lng: -77.4105, lat: 39.4144 },
        limit: 4,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "upstream-timeout",
      retryable: true,
    });

    delete process.env.MAPBOX_SEARCH_BOX_ENABLED;
    await expect(
      searchMapboxTemporary({
        action: "suggest",
        q: "coffee",
        sessionToken: SESSION_TOKEN,
        proximity: { lng: -77.4105, lat: 39.4144 },
        limit: 4,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "disabled",
      retryable: false,
    });
  });
});
