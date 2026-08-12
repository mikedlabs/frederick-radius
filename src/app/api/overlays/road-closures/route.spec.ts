import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  closures: vi.fn(),
}));

vi.mock("@/lib/integrations/md-road-closures", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/integrations/md-road-closures")
  >();
  return {
    ...original,
    getMarylandRoadClosuresFrederick: mocks.closures,
  };
});

import { GET } from "./route";

const CURRENT = {
  id: "md-road-closure-example",
  road: "E PATRICK ST",
  summary: "E PATRICK ST: Closed, all directions.",
  closureType: "Closed",
  lifecycle: "current" as const,
  startAt: "2026-08-11T15:00:00.000Z",
  endAt: "2026-08-11T20:00:00.000Z",
  updatedAt: "2026-08-11T15:30:00.000Z",
  geometry: {
    type: "LineString" as const,
    coordinates: [
      [-77.411, 39.414] as [number, number],
      [-77.409, 39.414] as [number, number],
    ],
  },
  sourceUrl:
    "https://mdgeodata.md.gov/appdata/rest/services/SHA_RoadClosure/RoadClosureActive/MapServer" as const,
};

describe("official Maryland road-closure overlay route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.closures.mockResolvedValue({
      data: [CURRENT],
      availability: "current",
      coverage: "complete",
      checkedAt: "2026-08-11T16:00:00.000Z",
      sourceAsOf: "2026-08-11T15:59:30.000Z",
      sourceUrl: CURRENT.sourceUrl,
    });
  });

  it("serves cacheable allowlisted GeoJSON with source state and ETag", async () => {
    const response = await GET(
      new Request("https://frederickradius.app/api/overlays/road-closures"),
    );
    const etag = response.headers.get("etag");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/geo+json",
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(response.headers.get("x-radius-source-status")).toBe("current");
    expect(response.headers.get("x-radius-source-coverage")).toBe("complete");
    expect(response.headers.get("x-radius-source-checked-at")).toBe(
      "2026-08-11T16:00:00.000Z",
    );
    expect(response.headers.get("x-radius-source-as-of")).toBe(
      "2026-08-11T15:59:30.000Z",
    );
    expect(etag).toBeTruthy();
    const body = await response.json();
    expect(body.features[0].properties).toMatchObject({
      road: "E PATRICK ST",
      status: "Current closure",
      lifecycle: "current",
      sourceLabel: "Maryland SHA road closures",
    });

    const notModified = await GET(
      new Request("https://frederickradius.app/api/overlays/road-closures", {
        headers: { "If-None-Match": etag as string },
      }),
    );
    expect(notModified.status).toBe(304);
    expect(notModified.headers.get("x-radius-source-status")).toBe("current");
  });

  it("short-caches a stale but still useful official snapshot", async () => {
    mocks.closures.mockResolvedValue({
      data: [CURRENT],
      availability: "stale",
      coverage: "complete",
      checkedAt: "2026-08-11T16:00:00.000Z",
      sourceAsOf: "2026-08-11T15:30:00.000Z",
      sourceUrl: CURRENT.sourceUrl,
    });
    const response = await GET(
      new Request("https://frederickradius.app/api/overlays/road-closures"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=15");
    expect(response.headers.get("x-radius-source-status")).toBe("stale");
  });

  it("does not turn a partial zero or outage into an all-clear", async () => {
    mocks.closures.mockResolvedValue({
      data: [],
      availability: "current",
      coverage: "partial",
      checkedAt: "2026-08-11T16:00:00.000Z",
      sourceAsOf: "2026-08-11T16:00:00.000Z",
      sourceUrl: CURRENT.sourceUrl,
    });
    const partial = await GET(
      new Request("https://frederickradius.app/api/overlays/road-closures"),
    );
    expect(partial.status).toBe(503);
    expect(partial.headers.get("cache-control")).toBe("no-store");

    mocks.closures.mockResolvedValue({
      data: [],
      availability: "unavailable",
      coverage: "none",
      checkedAt: "2026-08-11T16:00:00.000Z",
      sourceAsOf: null,
      sourceUrl: CURRENT.sourceUrl,
    });
    const outage = await GET(
      new Request("https://frederickradius.app/api/overlays/road-closures"),
    );
    expect(outage.status).toBe(503);
    expect(outage.headers.get("retry-after")).toBe("300");
  });
});
