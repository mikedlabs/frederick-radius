import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  POSTGIS_NEARBY_TIMEOUT_MS,
  postgisNearbyMode,
  postgisNearbyPlaceDistances,
} from "./place-spatial-index";

function queryText(strings: TemplateStringsArray): string {
  return Array.from(strings).join(" ");
}

describe("PostGIS nearby place distances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RADIUS_POSTGIS_NEARBY;
  });

  it("fails closed for every unrecognized rollout value", () => {
    expect(postgisNearbyMode(undefined)).toBe("off");
    expect(postgisNearbyMode("shadow")).toBe("shadow");
    expect(postgisNearbyMode("1")).toBe("on");
    expect(postgisNearbyMode("ON")).toBe("on");
    expect(postgisNearbyMode("enabled")).toBe("off");
  });

  it("does not query without a database or with a precise unrounded origin", async () => {
    const sql = vi.fn();
    mocks.getSql.mockReturnValueOnce(null).mockReturnValue(sql);

    await expect(
      postgisNearbyPlaceDistances({ lng: -77.411, lat: 39.414 }, 5_000),
    ).resolves.toBeNull();
    await expect(
      postgisNearbyPlaceDistances({ lng: -77.41062, lat: 39.41437 }, 5_000),
    ).resolves.toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("uses longitude first and returns validated meter distances", async () => {
    const sql = vi.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        expect(queryText(strings)).toContain("extensions.st_dwithin");
        expect(queryText(strings)).toContain(
          "OPERATOR(extensions.<->)",
        );
        expect(values[3]).toBe(-77.411);
        expect(values[4]).toBe(39.414);
        expect(values[5]).toBe(5_000);
        return Promise.resolve([
          {
            catalog_current: true,
            slug: "alpha",
            distance_m: "42.5",
          },
          {
            catalog_current: true,
            slug: "bravo",
            distance_m: 120,
          },
        ]);
      },
    );
    mocks.getSql.mockReturnValue(sql);

    const result = await postgisNearbyPlaceDistances(
      { lng: -77.411, lat: 39.414 },
      5_000,
    );

    expect(result).toEqual(
      new Map([
        ["alpha", 42.5],
        ["bravo", 120],
      ]),
    );
  });

  it("rejects stale catalog state and malformed spatial rows", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([
        {
          catalog_current: false,
          slug: null,
          distance_m: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          catalog_current: true,
          slug: "alpha",
          distance_m: -1,
        },
      ]);
    mocks.getSql.mockReturnValue(sql);

    await expect(
      postgisNearbyPlaceDistances({ lng: -77.411, lat: 39.414 }, 5_000),
    ).resolves.toBeNull();
    await expect(
      postgisNearbyPlaceDistances({ lng: -77.411, lat: 39.414 }, 5_000),
    ).resolves.toBeNull();
  });

  it("cancels a query that exceeds the response budget", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const pending = Object.assign(new Promise(() => undefined), { cancel });
    mocks.getSql.mockReturnValue(vi.fn(() => pending));

    const result = postgisNearbyPlaceDistances(
      { lng: -77.411, lat: 39.414 },
      5_000,
    );
    await vi.advanceTimersByTimeAsync(POSTGIS_NEARBY_TIMEOUT_MS);

    await expect(result).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
