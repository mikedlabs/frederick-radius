import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  reserveDailyUsage: vi.fn(),
}));

vi.mock("@/lib/mapbox-server", () => ({
  MAPBOX_SERVER_TOKEN: "test-mapbox-token",
  MAPBOX_SERVER_HEADERS: { Referer: "https://frederickradius.app/" },
}));

vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

import {
  getMapboxTravelMatrix,
  normalizeMapboxMatrixInput,
  type MapboxMatrixProfile,
} from "@/lib/integrations/mapboxMatrix";

const ORIGIN = { lng: -77.41049, lat: 39.41437 };
const DESTINATIONS = [
  { lng: -77.40712, lat: 39.41601 },
  { lng: -77.41674, lat: 39.41272 },
  { lng: -77.40111, lat: 39.42049 },
];

function matrixResponse(
  durations: Array<number | null>,
  distances: Array<number | null>,
) {
  return new Response(
    JSON.stringify({
      code: "Ok",
      durations: [durations],
      distances: [distances],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("normalizeMapboxMatrixInput", () => {
  it("rounds explicit coordinates to the existing Radius privacy grid", () => {
    expect(
      normalizeMapboxMatrixInput({
        profile: "walking",
        origin: ORIGIN,
        destinations: DESTINATIONS.slice(0, 2),
      }),
    ).toEqual({
      ok: true,
      value: {
        profile: "walking",
        origin: { lng: -77.41, lat: 39.414 },
        destinations: [
          { lng: -77.407, lat: 39.416 },
          { lng: -77.417, lat: 39.413 },
        ],
      },
    });
  });

  it.each([
    ["bad-profile", { profile: "scooter", origin: ORIGIN, destinations: DESTINATIONS }],
    ["bad-origin", { profile: "walking", origin: null, destinations: DESTINATIONS }],
    [
      "out-of-county-origin",
      {
        profile: "walking",
        origin: { lng: -76.6122, lat: 39.2904 },
        destinations: DESTINATIONS,
      },
    ],
    [
      "too-few-destinations",
      { profile: "walking", origin: ORIGIN, destinations: DESTINATIONS.slice(0, 1) },
    ],
    [
      "too-many-destinations",
      {
        profile: "walking",
        origin: ORIGIN,
        destinations: Array.from({ length: 10 }, () => DESTINATIONS[0]),
      },
    ],
    [
      "out-of-county-destination",
      {
        profile: "walking",
        origin: ORIGIN,
        destinations: [
          DESTINATIONS[0],
          { lng: -76.6122, lat: 39.2904 },
        ],
      },
    ],
  ])("fails clearly with %s", (reason, input) => {
    expect(normalizeMapboxMatrixInput(input)).toEqual({ ok: false, reason });
  });
});

describe("getMapboxTravelMatrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    process.env.MAPBOX_MATRIX_ENABLED = "1";
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 3 });
    delete process.env.MAPBOX_MATRIX_DAILY_ELEMENT_CAP;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_MATRIX_ENABLED;
    delete process.env.MAPBOX_MATRIX_DAILY_ELEMENT_CAP;
  });

  it("requests only a one-to-many matrix and maps reachable and null legs", async () => {
    mocks.fetch.mockResolvedValue(
      matrixResponse([301.4, null, 842], [412.7, null, 6021.2]),
    );

    const result = await getMapboxTravelMatrix({
      profile: "walking",
      origin: ORIGIN,
      destinations: DESTINATIONS,
    });

    expect(result).toEqual({
      ok: true,
      profile: "walking",
      origin: { lng: -77.41, lat: 39.414 },
      legs: [
        {
          destinationIndex: 0,
          destination: { lng: -77.407, lat: 39.416 },
          reachable: true,
          durationSeconds: 301.4,
          minutes: 5,
          distanceMeters: 413,
        },
        {
          destinationIndex: 1,
          destination: { lng: -77.417, lat: 39.413 },
          reachable: false,
          durationSeconds: null,
          minutes: null,
          distanceMeters: null,
        },
        {
          destinationIndex: 2,
          destination: { lng: -77.401, lat: 39.42 },
          reachable: true,
          durationSeconds: 842,
          minutes: 14,
          distanceMeters: 6021,
        },
      ],
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [rawUrl, init] = mocks.fetch.mock.calls[0];
    const url = new URL(String(rawUrl));
    expect(url.pathname).toBe(
      "/directions-matrix/v1/mapbox/walking/-77.41,39.414;-77.407,39.416;-77.417,39.413;-77.401,39.42",
    );
    expect(url.searchParams.get("sources")).toBe("0");
    expect(url.searchParams.get("destinations")).toBe("1;2;3");
    expect(url.searchParams.get("annotations")).toBe("duration,distance");
    expect(url.searchParams.get("access_token")).toBe("test-mapbox-token");
    expect(init).toEqual(
      expect.objectContaining({
        headers: { Referer: "https://frederickradius.app/" },
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "mapbox_matrix",
      1_000,
      3,
    );
  });

  it.each([
    ["walking", "mapbox/walking"],
    ["cycling", "mapbox/cycling"],
    ["driving", "mapbox/driving"],
    ["driving-traffic", "mapbox/driving-traffic"],
  ] as Array<[MapboxMatrixProfile, string]>)(
    "uses the %s profile",
    async (profile, path) => {
      mocks.fetch.mockResolvedValue(matrixResponse([60, 120], [100, 200]));
      await getMapboxTravelMatrix({
        profile,
        origin: ORIGIN,
        destinations: DESTINATIONS.slice(0, 2),
      });
      expect(String(mocks.fetch.mock.calls[0]?.[0])).toContain(
        `/directions-matrix/v1/${path}/`,
      );
    },
  );

  it("returns a retryable structured failure for upstream throttling", async () => {
    mocks.fetch.mockResolvedValue(new Response("busy", { status: 429 }));

    expect(
      await getMapboxTravelMatrix({
        profile: "driving",
        origin: ORIGIN,
        destinations: DESTINATIONS.slice(0, 2),
      }),
    ).toEqual({ ok: false, reason: "upstream-429", retryable: true });
  });

  it("distinguishes a timeout from other network failures", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    mocks.fetch.mockRejectedValueOnce(timeout).mockRejectedValueOnce(new Error("offline"));

    const input = {
      profile: "cycling",
      origin: ORIGIN,
      destinations: DESTINATIONS.slice(0, 2),
    };
    expect(await getMapboxTravelMatrix(input)).toEqual({
      ok: false,
      reason: "upstream-timeout",
      retryable: true,
    });
    expect(await getMapboxTravelMatrix(input)).toEqual({
      ok: false,
      reason: "upstream-network",
      retryable: true,
    });
  });

  it("does not trust an incomplete upstream matrix", async () => {
    mocks.fetch.mockResolvedValue(matrixResponse([60], [100]));

    expect(
      await getMapboxTravelMatrix({
        profile: "walking",
        origin: ORIGIN,
        destinations: DESTINATIONS.slice(0, 2),
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-upstream-response",
      retryable: true,
    });
  });

  it("stays off until its dedicated cost switch is enabled", async () => {
    delete process.env.MAPBOX_MATRIX_ENABLED;

    await expect(
      getMapboxTravelMatrix({
        profile: "walking",
        origin: ORIGIN,
        destinations: DESTINATIONS.slice(0, 2),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "disabled",
      retryable: false,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
  });

  it("treats a zero Matrix allowance as a token-preserving breaker", async () => {
    process.env.MAPBOX_MATRIX_DAILY_ELEMENT_CAP = "0";

    await expect(
      getMapboxTravelMatrix({
        profile: "walking",
        origin: ORIGIN,
        destinations: DESTINATIONS.slice(0, 2),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "disabled",
      retryable: false,
    });
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [null, { ok: false, reason: "cost-control-unavailable", retryable: true }],
    [
      { reserved: false, count: 8 },
      { ok: false, reason: "daily-cap-reached", retryable: false },
    ],
  ])("does not call Mapbox when its atomic element reservation is unavailable", async (reservation, expected) => {
    process.env.MAPBOX_MATRIX_DAILY_ELEMENT_CAP = "8";
    mocks.reserveDailyUsage.mockResolvedValue(reservation);

    await expect(
      getMapboxTravelMatrix({
        profile: "walking",
        origin: ORIGIN,
        destinations: DESTINATIONS,
      }),
    ).resolves.toEqual(expected);

    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "mapbox_matrix",
      8,
      3,
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("reports a non-JSON upstream body as an invalid response", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("<html>temporary error</html>", { status: 200 }),
    );

    expect(
      await getMapboxTravelMatrix({
        profile: "walking",
        origin: ORIGIN,
        destinations: DESTINATIONS.slice(0, 2),
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-upstream-response",
      retryable: true,
    });
  });
});
