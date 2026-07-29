import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCountyArcGisQueryUrl,
  cleanCountyValue,
  countyPointGeometry,
  fetchCountyArcGis,
  frederickCountySourceEnabled,
} from "./fcCountySource";

const originalApproval = process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
const originalApprovedSources =
  process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;
const originalPublicGisEnabled = process.env.FREDERICK_COUNTY_GIS_ENABLED;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalApproval == null) {
    delete process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
  } else {
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = originalApproval;
  }
  if (originalApprovedSources == null) {
    delete process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;
  } else {
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES =
      originalApprovedSources;
  }
  if (originalPublicGisEnabled == null) {
    delete process.env.FREDERICK_COUNTY_GIS_ENABLED;
  } else {
    process.env.FREDERICK_COUNTY_GIS_ENABLED = originalPublicGisEnabled;
  }
});

function request(overrides: Record<string, unknown> = {}) {
  return {
    sourceId: "fc_recreation_locations" as const,
    endpoint: "https://example.test/arcgis/rest/services/Test/MapServer/0/query",
    outFields: ["OBJECTID", "PublicName"],
    cacheSeconds: 300,
    cacheTag: "county-test",
    pageSize: 2,
    ...overrides,
  };
}

describe("County ArcGIS permission boundary", () => {
  it("keeps approval-gated sources disabled without making a request", async () => {
    delete process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
    delete process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchCountyArcGis(request());

    expect(result).toMatchObject({
      ok: false,
      configured: false,
      features: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not let the global switch approve an unlisted source", async () => {
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = "1";
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES = "fc_high_water";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchCountyArcGis(request())).resolves.toMatchObject({
      ok: false,
      configured: false,
      features: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enables public GIS by default and honors the incident kill switch", () => {
    delete process.env.FREDERICK_COUNTY_GIS_ENABLED;
    expect(frederickCountySourceEnabled("fc_planning_projects")).toBe(true);
    expect(frederickCountySourceEnabled("fc_snow_command")).toBe(true);
    expect(frederickCountySourceEnabled("fc_parks_assets")).toBe(true);
    expect(frederickCountySourceEnabled("fc_high_water")).toBe(true);
    expect(frederickCountySourceEnabled("fc_municipal_boundaries")).toBe(true);
    expect(frederickCountySourceEnabled("fc_county_parks")).toBe(true);
    expect(frederickCountySourceEnabled("fc_park_trails")).toBe(true);
    expect(frederickCountySourceEnabled("fc_historic_cemeteries")).toBe(true);

    process.env.FREDERICK_COUNTY_GIS_ENABLED = "0";
    expect(frederickCountySourceEnabled("fc_planning_projects")).toBe(false);
    expect(frederickCountySourceEnabled("fc_historic_cemeteries")).toBe(false);
  });
});

describe("fetchCountyArcGis", () => {
  it("paginates on transfer limits, dedupes overlapping OBJECTIDs, and records provenance", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              { type: "Feature", id: 1, properties: { OBJECTID: 1 } },
              { type: "Feature", id: 2, properties: { OBJECTID: 2 } },
            ],
            exceededTransferLimit: true,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              date: "Tue, 28 Jul 2026 15:30:00 GMT",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [
              { type: "Feature", id: 2, properties: { OBJECTID: 2 } },
              { type: "Feature", id: 3, properties: { OBJECTID: 3 } },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchCountyArcGis(
      request({ sourceId: "fc_planning_projects" }),
    );

    expect(result.ok).toBe(true);
    expect(result.configured).toBe(true);
    if (!result.ok) throw new Error("expected successful source pull");
    expect(result.features.map((feature) => feature.id)).toEqual([1, 2, 3]);
    expect(result.sourceResponseAt).toBe("2026-07-28T15:30:00.000Z");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchSpy.mock.calls[0][0])).searchParams.get("resultOffset")).toBe("0");
    expect(new URL(String(fetchSpy.mock.calls[1][0])).searchParams.get("resultOffset")).toBe("2");
  });

  it("drops every partial record when a later page fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              type: "FeatureCollection",
              features: [{ type: "Feature", id: 1 }],
              properties: { exceededTransferLimit: true },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response("upstream failure", { status: 503 })),
    );

    await expect(
      fetchCountyArcGis(request({ sourceId: "fc_planning_projects" })),
    ).resolves.toMatchObject({
      ok: false,
      configured: true,
      features: [],
    });
  });

  it("treats a 200 ArcGIS error envelope as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 500, message: "Nope" } }), {
          status: 200,
        }),
      ),
    );

    await expect(
      fetchCountyArcGis(request({ sourceId: "fc_planning_projects" })),
    ).resolves.toMatchObject({
      ok: false,
      features: [],
    });
  });
});

describe("County source helpers", () => {
  it("builds a WGS84, ordered, public-field-only query", () => {
    const url = new URL(
      buildCountyArcGisQueryUrl(
        {
          endpoint: "https://example.test/layer/query",
          sourceId: "fc_planning_projects",
          outFields: ["OBJECTID", "PublicName"],
          pageSize: 500,
          maxAllowableOffset: 0.0001,
        },
        500,
      ),
    );
    expect(url.searchParams.get("outFields")).toBe("OBJECTID,PublicName");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("orderByFields")).toBe("OBJECTID ASC");
    expect(url.searchParams.get("resultOffset")).toBe("500");
    expect(url.searchParams.get("maxAllowableOffset")).toBe("0.0001");
  });

  it("cleans public text and rejects points outside Frederick", () => {
    expect(cleanCountyValue("<b> Baker   Park </b>\u0000")).toBe("Baker Park");
    expect(cleanCountyValue("N/A")).toBeUndefined();
    expect(
      countyPointGeometry({
        type: "Point",
        coordinates: [-77.4105, 39.4143],
      }),
    ).toBeDefined();
    expect(
      countyPointGeometry({
        type: "Point",
        coordinates: [-104.9903, 39.7392],
      }),
    ).toBeUndefined();
  });
});
