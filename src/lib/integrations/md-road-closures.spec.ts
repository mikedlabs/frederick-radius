import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMarylandRoadClosuresFrederick,
  marylandRoadClosuresGeoJson,
  MD_ROAD_CLOSURES_SOURCE_URL,
  normalizeMarylandRoadClosureLayers,
} from "./md-road-closures";

const NOW = new Date("2026-08-11T16:00:00.000Z");
const CURRENT_START = new Date(NOW.getTime() - 60 * 60_000).getTime();
const CURRENT_END = new Date(NOW.getTime() + 4 * 60 * 60_000).getTime();

function point(
  id: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: "Feature",
    id,
    geometry: {
      type: "Point",
      coordinates: [-77.4108 + id * 0.000001, 39.4143],
    },
    properties: {
      OBJECTID: id,
      ClosureStart: CURRENT_START,
      ClosureEnd: CURRENT_END,
      ClosureType: "Closed",
      CreationDate: CURRENT_START,
      EditDate: NOW.getTime() - 15 * 60_000,
      Comments: "Water main repair. Local detour posted.",
      RoadName: "E PATRICK ST",
      CrossStreet1: "Carroll Street",
      CrossStreet2: "East Street",
      ClosureSummary: "E PATRICK ST: Closed, all directions.",
      Jurisdiction: "FREDERICK CITY",
      CountyFips: "24021",
      RC_GUID: `{CLOSURE-${id}}`,
      typeSummary: "Construction",
      Direction: "All Directions",
      Lanes: "All",
      Creator: "must-not-leak",
      ...overrides,
    },
  };
}

function segment(
  id: number,
  guid = `{CLOSURE-${id}}`,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: "Feature",
    id: id + 100,
    geometry: {
      type: "LineString",
      coordinates: [
        [-77.411, 39.414],
        [-77.409, 39.414],
      ],
    },
    properties: {
      OBJECTID: id + 100,
      ClosureStart: CURRENT_START,
      ClosureEnd: CURRENT_END,
      ClosureType: "Closed",
      CreationDate: CURRENT_START,
      EditDate: NOW.getTime() - 20 * 60_000,
      Comments: "Segment copy",
      RoadName: "E PATRICK ST",
      CrossStreet1: "Carroll Street",
      CrossStreet2: "East Street",
      closureSummary: "Segment summary",
      Jurisdiction: "FREDERICK CITY",
      CountyFips: "24021",
      RC_GUID: guid,
      typeSummary: "Construction",
      ...overrides,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Maryland active road-closure normalization", () => {
  it("joins canonical point details to all segment geometry and allowlists output", () => {
    const secondSegment = segment(2, "{CLOSURE-1}");
    secondSegment.geometry.coordinates = [
      [-77.409, 39.414],
      [-77.408, 39.415],
    ];
    // Segment dates can lag the canonical point row. This deliberately
    // malformed segment schedule must not replace the point schedule.
    secondSegment.properties.ClosureEnd = CURRENT_START - 60_000;

    const result = normalizeMarylandRoadClosureLayers({
      points: [point(1)],
      segments: [segment(1), secondSegment],
      checkedAt: NOW,
      sourceAsOf: NOW.toISOString(),
    });

    expect(result).toMatchObject({
      availability: "current",
      coverage: "complete",
      checkedAt: NOW.toISOString(),
      sourceUrl: MD_ROAD_CLOSURES_SOURCE_URL,
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: "md-road-closure-closure-1",
        lifecycle: "current",
        summary: "E PATRICK ST: Closed, all directions.",
        crossStreets: "Carroll Street to East Street",
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [-77.411, 39.414],
              [-77.409, 39.414],
            ],
            [
              [-77.409, 39.414],
              [-77.408, 39.415],
            ],
          ],
        },
      }),
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("Creator");
  });

  it("keeps scheduled closures distinct and removes expired or invalid rows", () => {
    const futureStart = NOW.getTime() + 2 * 60 * 60_000;
    const futureEnd = futureStart + 60 * 60_000;
    const expired = point(2, {
      ClosureStart: NOW.getTime() - 3 * 60 * 60_000,
      ClosureEnd: NOW.getTime() - 60 * 60_000,
    });
    const invalid = point(3, {
      ClosureStart: NOW.getTime() + 60 * 60_000,
      ClosureEnd: NOW.getTime() - 60 * 60_000,
    });
    const result = normalizeMarylandRoadClosureLayers({
      points: [
        point(1, { ClosureStart: futureStart, ClosureEnd: futureEnd }),
        expired,
        invalid,
      ],
      segments: [],
      checkedAt: NOW,
      sourceAsOf: NOW.toISOString(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ lifecycle: "scheduled" });
    expect(marylandRoadClosuresGeoJson(result).features[0].properties).toMatchObject({
      status: "Scheduled closure",
      lifecycle: "scheduled",
      impactKind: "closure",
      checkedAt: NOW.toISOString(),
      sourceLabel: "Maryland SHA road closures",
    });
  });

  it("separates a stale successful check from an unavailable source", () => {
    const stale = normalizeMarylandRoadClosureLayers({
      points: [point(1)],
      segments: [],
      checkedAt: NOW,
      sourceAsOf: new Date(NOW.getTime() - 11 * 60_000).toISOString(),
    });
    expect(stale).toMatchObject({
      availability: "stale",
      coverage: "complete",
    });

    const unavailable = normalizeMarylandRoadClosureLayers({
      points: [],
      segments: [],
      pointAvailable: false,
      segmentAvailable: false,
      checkedAt: NOW,
      sourceAsOf: null,
    });
    expect(unavailable).toMatchObject({
      availability: "unavailable",
      coverage: "none",
      data: [],
    });
  });
});

describe("Maryland active road-closure fetch boundary", () => {
  it("paginates both WGS84 layers in stable OBJECTID order", async () => {
    const firstPointPage = Array.from({ length: 250 }, (_, index) =>
      point(index + 1),
    );
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      const layer = url.pathname.endsWith("/0/query") ? 0 : 1;
      const offset = Number(url.searchParams.get("resultOffset"));
      const features = layer === 0
        ? offset === 0
          ? firstPointPage
          : [point(251)]
        : [];
      return Response.json(
        {
          type: "FeatureCollection",
          features,
          exceededTransferLimit: layer === 0 && offset === 0,
        },
        { headers: { Date: NOW.toUTCString() } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMarylandRoadClosuresFrederick({
      now: NOW,
      deadlineMs: 500,
      revalidateSeconds: 90,
    });

    expect(result).toMatchObject({
      availability: "current",
      coverage: "complete",
    });
    expect(result.data).toHaveLength(251);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.some((url) => url.searchParams.get("resultOffset") === "250"))
      .toBe(true);
    for (const url of urls) {
      expect(url.searchParams.get("where")).toBe("CountyFips='24021'");
      expect(url.searchParams.get("outSR")).toBe("4326");
      expect(url.searchParams.get("orderByFields")).toBe("OBJECTID ASC");
      expect(url.searchParams.get("outFields")).not.toContain("Creator");
      expect(url.searchParams.get("outFields")).not.toContain("Editor");
    }
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      signal: expect.any(AbortSignal),
      next: { revalidate: 90 },
    });
  });

  it("aborts stalled layers and returns unavailable instead of false-empty", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
      ),
    );

    const pending = getMarylandRoadClosuresFrederick({
      now: NOW,
      deadlineMs: 50,
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toMatchObject({
      availability: "unavailable",
      coverage: "none",
      data: [],
    });
  });
});
