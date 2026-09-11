import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parks: vi.fn(),
  planning: vi.fn(),
  cityChanges: vi.fn(),
}));

vi.mock("@/lib/integrations/fcGis", () => ({
  getCountyParks: mocks.parks,
}));

vi.mock("@/lib/integrations/fcPlanningProjects", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/integrations/fcPlanningProjects")
  >();
  return {
    ...original,
    getCountyPlanningApplications: mocks.planning,
  };
});

vi.mock("@/lib/integrations/cityFrederickChanges", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/integrations/cityFrederickChanges")
  >();
  return {
    ...original,
    getCityFrederickChangeRecords: mocks.cityChanges,
  };
});

import { GET as getParks } from "./parks/route";
import { GET as getPlanning } from "./planning/route";

const planningGeometry = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-77.42, 39.41],
      [-77.41, 39.41],
      [-77.41, 39.42],
      [-77.42, 39.41],
    ],
  ],
};

describe("live County overlay routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parks.mockResolvedValue([
      {
        name: "Baker Park",
        address: "121 N Bentz St",
        municipality: "Frederick",
        lng: -77.417,
        lat: 39.418,
      },
    ]);
    mocks.planning.mockResolvedValue({
      configured: true,
      availability: "available",
      records: [
        {
          id: "fc-planning-42",
          name: "Brickworks",
          applicationType: "Site plan",
          milestone: "Awaiting applicant revisions",
          lifecycle: "open_application",
          constructionStatus: "not_established",
          geometry: planningGeometry,
        },
      ],
      provenance: {
        checkedAt: "2026-08-11T12:00:00.000Z",
      },
    });
    mocks.cityChanges.mockResolvedValue({
      capital: {
        configured: true,
        availability: "unavailable",
        records: [],
        provenance: { checkedAt: "2026-08-11T12:00:00.000Z" },
      },
      development: {
        configured: true,
        availability: "unavailable",
        records: [],
        provenance: { checkedAt: "2026-08-11T12:00:00.000Z" },
      },
    });
  });

  it("serves parks as cacheable allowlisted GeoJSON with conditional ETags", async () => {
    const response = await getParks(
      new Request("https://frederickradius.app/api/overlays/parks"),
    );
    const etag = response.headers.get("etag");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/geo+json",
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(etag).toBeTruthy();
    expect(await response.json()).toMatchObject({
      type: "FeatureCollection",
      features: [{ properties: { name: "Baker Park" } }],
    });

    const notModified = await getParks(
      new Request("https://frederickradius.app/api/overlays/parks", {
        headers: { "If-None-Match": etag as string },
      }),
    );
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe("");
  });

  it("does not poison the park cache when the legacy getter fails soft", async () => {
    mocks.parks.mockResolvedValue([]);
    const response = await getParks(
      new Request("https://frederickradius.app/api/overlays/parks"),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves open applications with their trust boundary intact", async () => {
    const response = await getPlanning(
      new Request("https://frederickradius.app/api/overlays/planning"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(response.headers.get("x-radius-source-coverage")).toBe("partial");
    expect(response.headers.get("x-radius-source-checked-at")).toBe(
      "2026-08-11T12:00:00.000Z",
    );
    expect(body.features[0].properties).toMatchObject({
      popup_label: "County planning application",
      status_label: "Open application",
      construction_status: "not_established",
      checked_at: "2026-08-11T12:00:00.000Z",
      caveat: expect.stringContaining("not evidence of approval"),
    });
  });

  it("merges City projects and reviews without collapsing lifecycle states", async () => {
    mocks.cityChanges.mockResolvedValue({
      capital: {
        configured: true,
        availability: "available",
        records: [
          {
            id: "cof-cip-1",
            sourceId: "cof_capital_improvement",
            sourceRecordId: "1",
            kind: "capital_project",
            name: "Baker Park project",
            statusLabel: "City project · Construction",
            lifecycle: "construction",
            constructionStatus: "reported",
            sourceUpdatedAt: "2026-08-10T12:00:00.000Z",
            contentHash: `sha256:${"a".repeat(64)}`,
            geometry: {
              type: "Point",
              coordinates: [-77.417, 39.418],
            },
          },
        ],
        provenance: {
          checkedAt: "2026-08-11T11:00:00.000Z",
          dataCheckedAt: "2026-08-11T11:00:00.000Z",
          latestRecordUpdatedAt: "2026-08-10T12:00:00.000Z",
        },
      },
      development: {
        configured: true,
        availability: "available",
        records: [
          {
            id: "cof-review-2",
            sourceId: "cof_development_review",
            sourceRecordId: "2",
            kind: "development_review",
            name: "Frederick Gateway",
            statusLabel: "Development review · Review complete",
            lifecycle: "review_complete",
            constructionStatus: "not_established",
            contentHash: `sha256:${"b".repeat(64)}`,
            geometry: {
              type: "Point",
              coordinates: [-77.369, 39.402],
            },
          },
        ],
        provenance: {
          checkedAt: "2026-08-11T10:00:00.000Z",
          dataCheckedAt: "2026-08-11T10:00:00.000Z",
        },
      },
    });

    const response = await getPlanning(
      new Request("https://frederickradius.app/api/overlays/planning"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-radius-source-coverage")).toBe("complete");
    expect(response.headers.get("x-radius-source-status")).toBe("current");
    expect(response.headers.get("cache-control")).toContain("s-maxage=21600");
    expect(response.headers.get("x-radius-source-checked-at")).toBe(
      "2026-08-11T10:00:00.000Z",
    );
    expect(body.features.map((feature: { properties: Record<string, string> }) => ({
      kind: feature.properties.record_kind,
      lifecycle: feature.properties.lifecycle,
      construction: feature.properties.construction_status,
    }))).toEqual([
      {
        kind: "county_open_application",
        lifecycle: "open_application",
        construction: "not_established",
      },
      {
        kind: "capital_project",
        lifecycle: "construction",
        construction: "reported",
      },
      {
        kind: "development_review",
        lifecycle: "review_complete",
        construction: "not_established",
      },
    ]);
  });

  it("marks a mixed last-good City response stale instead of fresh", async () => {
    mocks.cityChanges.mockResolvedValue({
      capital: {
        configured: true,
        availability: "stale",
        records: [],
        provenance: {
          checkedAt: "2026-08-11T12:00:00.000Z",
          dataCheckedAt: "2026-08-09T12:00:00.000Z",
        },
      },
      development: {
        configured: true,
        availability: "available",
        records: [],
        provenance: {
          checkedAt: "2026-08-11T12:00:00.000Z",
          dataCheckedAt: "2026-08-11T12:00:00.000Z",
        },
      },
    });

    const response = await getPlanning(
      new Request("https://frederickradius.app/api/overlays/planning"),
    );
    expect(response.headers.get("x-radius-source-status")).toBe("stale");
    expect(response.headers.get("x-radius-source-checked-at")).toBe(
      "2026-08-09T12:00:00.000Z",
    );
  });

  it("returns a retryable, non-cacheable failure when planning is unavailable", async () => {
    mocks.planning.mockResolvedValue({
      configured: true,
      availability: "unavailable",
      records: [],
      provenance: { checkedAt: "2026-08-11T12:00:00.000Z" },
    });
    const response = await getPlanning(
      new Request("https://frederickradius.app/api/overlays/planning"),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("300");
  });
});
