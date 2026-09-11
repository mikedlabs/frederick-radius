import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CITY_MOBILITY_CACHE_MAX_ENTRIES,
  CITY_MOBILITY_SOURCE_URLS,
  frederickCityMobilityCacheSizeForTests,
  getFrederickCityMobility,
  resetFrederickCityMobilityCacheForTests,
} from "./frederickCityMobility";

const bounds = {
  west: -77.43,
  south: 39.4,
  east: -77.38,
  north: 39.45,
};

function bodyFor(url: URL, overrides: Record<string, unknown> = {}) {
  const path = url.pathname;
  if (path.includes("/Sidewalks/MapServer/2/")) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            OBJECTID: 1,
            Segment_ID: 90,
            StreetName: "Market St",
            Width_ft: 5,
            Surface_Ty: "CONCRETE\n",
            private_field: "must not escape",
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [-77.41, 39.41],
              [-77.409, 39.411],
            ],
          },
        },
      ],
      exceededTransferLimit: false,
      ...overrides,
    };
  }
  if (path.includes("/Sidewalks/MapServer/0/")) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            OBJECTID: 2,
            ID: 120,
            Ramp_Material: "Concrete",
            Ramp_Type: "Perpendicular",
            Ramp_width: "4",
            Tactile_Warning_Pad: "Yes",
            ADA_Description: "Mapped",
            Data_Date: "2025",
          },
          geometry: { type: "Point", coordinates: [-77.408, 39.412] },
        },
      ],
      exceededTransferLimit: false,
      ...overrides,
    };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          OBJECTID: 3,
          Id: 0,
          PATH_NAME: "Carroll Creek",
          STATUS: "EXISTING",
          PATH_WIDTH: 8,
          Length: 1400,
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [-77.412, 39.413],
            [-77.405, 39.414],
          ],
        },
      },
      {
        type: "Feature",
        properties: {
          OBJECTID: 4,
          Id: 0,
          PATH_NAME: "Future connector",
          STATUS: "PROPOSED",
          PATH_WIDTH: 8,
          Length: 900,
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [-77.402, 39.415],
            [-77.4, 39.417],
          ],
        },
      },
    ],
    exceededTransferLimit: false,
    ...overrides,
  };
}

function successfulFetcher() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    return new Response(JSON.stringify(bodyFor(url)), {
      status: 200,
      headers: { "Content-Type": "application/geo+json" },
    });
  });
}

afterEach(() => {
  resetFrederickCityMobilityCacheForTests();
  vi.restoreAllMocks();
});

describe("Frederick City mobility normalization", () => {
  it("queries a bounded WGS84 envelope with stable ordering and allowlisted fields", async () => {
    const fetcher = successfulFetcher();
    const result = await getFrederickCityMobility(bounds, {
      now: new Date("2026-08-11T16:00:00.000Z"),
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [input] of fetcher.mock.calls) {
      const url = new URL(String(input));
      expect(url.searchParams.get("geometry")).toBe(
        "-77.43,39.4,-77.38,39.45",
      );
      expect(url.searchParams.get("inSR")).toBe("4326");
      expect(url.searchParams.get("outSR")).toBe("4326");
      expect(url.searchParams.get("orderByFields")).toBe("OBJECTID ASC");
      expect(url.searchParams.get("resultOffset")).toBe("0");
      expect(url.searchParams.get("outFields")).not.toContain("*");
    }

    expect(result.radius).toMatchObject({
      status: "current",
      coverage: "complete",
      routingRule: "Only confirmed EXISTING linework may inform a route.",
    });
    expect(result.radius.sources.bikePaths).toMatchObject({
      status: "unavailable",
      count: 0,
    });
    const sidewalk = result.features.find(
      (feature) => feature.properties.mobility_kind === "sidewalk",
    );
    expect(sidewalk?.properties).toMatchObject({
      name: "Market St sidewalk",
      surface_type: "CONCRETE",
      routing_eligible: true,
      status: "EXISTING",
    });
    expect(sidewalk?.properties).not.toHaveProperty("private_field");
  });

  it("keeps non-existing Path Plan segments as context, never route geometry", async () => {
    const result = await getFrederickCityMobility(bounds, {
      now: new Date("2026-08-11T16:00:00.000Z"),
      fetcher: successfulFetcher() as unknown as typeof fetch,
    });
    const paths = result.features.filter(
      (feature) => feature.properties.mobility_kind === "path",
    );
    expect(paths.map((feature) => feature.properties)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Carroll Creek",
          status: "EXISTING",
          routing_eligible: true,
          routing_role: "network",
        }),
        expect.objectContaining({
          name: "Future connector",
          status: "PROPOSED",
          routing_eligible: false,
          routing_role: "context",
        }),
      ]),
    );
  });

  it("paginates by stable OBJECTID offsets", async () => {
    const seenOffsets: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const offset = url.searchParams.get("resultOffset") ?? "";
      seenOffsets.push(`${url.pathname}:${offset}`);
      const pagedSidewalk =
        url.pathname.includes("/Sidewalks/MapServer/2/") && offset === "0";
      return new Response(
        JSON.stringify(
          bodyFor(url, pagedSidewalk ? { exceededTransferLimit: true } : {}),
        ),
        { status: 200 },
      );
    });
    await getFrederickCityMobility(bounds, {
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(
      seenOffsets.some(
        (entry) =>
          entry.includes("/Sidewalks/MapServer/2/query") &&
          entry.endsWith(":500"),
      ),
    ).toBe(true);
  });

  it("uses a bounded stale snapshot when the City service cannot refresh", async () => {
    const first = await getFrederickCityMobility(bounds, {
      now: new Date("2026-08-11T16:00:00.000Z"),
      fetcher: successfulFetcher() as unknown as typeof fetch,
    });
    expect(first.radius.status).toBe("current");

    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    const stale = await getFrederickCityMobility(bounds, {
      now: new Date("2026-08-11T16:11:00.000Z"),
      fetcher: failing as unknown as typeof fetch,
    });
    expect(stale.radius.status).toBe("stale");
    expect(stale.radius.coverage).toBe("partial");
    expect(stale.features).toHaveLength(first.features.length);
    expect(stale.radius.sources.paths.reason).toContain("last successful");
  });

  it("caps unique viewport snapshots instead of growing process memory forever", async () => {
    const fetcher = successfulFetcher();
    for (let index = 0; index < 40; index += 1) {
      const shift = index * 0.0001;
      await getFrederickCityMobility(
        {
          west: bounds.west + shift,
          south: bounds.south,
          east: bounds.east + shift,
          north: bounds.north,
        },
        {
          now: new Date("2026-08-11T16:00:00.000Z"),
          fetcher: fetcher as unknown as typeof fetch,
        },
      );
    }

    expect(frederickCityMobilityCacheSizeForTests()).toBe(
      CITY_MOBILITY_CACHE_MAX_ENTRIES,
    );
  });
});

describe("official source contract", () => {
  it("keeps the broken BikePaths service visible as unavailable evidence", () => {
    expect(CITY_MOBILITY_SOURCE_URLS.bikePaths).toBe(
      "https://spires.cityoffrederick.com/arcgis/rest/services/BikePaths/MapServer",
    );
  });
});
