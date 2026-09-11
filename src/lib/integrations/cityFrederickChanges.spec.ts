import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCityCapitalProjects,
  getCityDevelopmentReviews,
  resetCityFrederickChangeCache,
} from "./cityFrederickChanges";

const point = {
  type: "Point",
  coordinates: [-77.411066, 39.411778],
};

function response(
  features: unknown[],
  exceededTransferLimit = false,
): Response {
  return new Response(
    JSON.stringify({
      type: "FeatureCollection",
      features,
      exceededTransferLimit,
      properties: { exceededTransferLimit },
    }),
    {
      status: 200,
      headers: { Date: "Tue, 11 Aug 2026 16:00:00 GMT" },
    },
  );
}

describe("City of Frederick change records", () => {
  beforeEach(() => {
    resetCityFrederickChangeCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps capital-project planning distinct from construction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response([
          {
            type: "Feature",
            id: 1,
            geometry: point,
            properties: {
              OBJECTID: 1,
              GlobalID: "{A37B23DE-CAF1-4D3F-B103-C8DF0FFBED5E}",
              PROJECT_NUMBER: "110008",
              PROJECT_NAME: "Salt Storage",
              STATUS: "Planning",
              ADDRESS: "111 Airport Drive E",
              Type: "Facilities",
              DISTRICT: "3",
              last_edited_date: Date.UTC(2026, 6, 1),
              OWNER_NAME: "not allowlisted",
            },
          },
        ]),
      ),
    );

    const snapshot = await getCityCapitalProjects();
    expect(snapshot.availability).toBe("available");
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.records[0]).toMatchObject({
      id: "cof-cip-a37b23de-caf1-4d3f-b103-c8df0ffbed5e",
      sourceRecordId: "a37b23de-caf1-4d3f-b103-c8df0ffbed5e",
      kind: "capital_project",
      name: "Salt Storage",
      referenceId: "110008",
      lifecycle: "planning",
      constructionStatus: "not_established",
      statusLabel: "City project · Planning",
      sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
      contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(snapshot.records[0])).not.toContain(
      "not allowlisted",
    );
  });

  it("does not translate a completed review into approval or construction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response([
          {
            type: "Feature",
            id: 6,
            geometry: point,
            properties: {
              OBJECTID: 6,
              GlobalID: "{5D2D3610-9AE8-4625-A6EC-33CCCD820DD8}",
              caseId: "PC25-579FSI",
              Name: "Costco",
              commission: "Planning Commission",
              status: "Complete",
              type: "Final Site Plan",
              Description:
                "<b>Proposed</b> 5,931sf addition to the existing building.",
              last_edited_date: Date.UTC(2026, 6, 2),
            },
          },
        ]),
      ),
    );

    const snapshot = await getCityDevelopmentReviews();
    expect(snapshot.records[0]).toMatchObject({
      kind: "development_review",
      lifecycle: "review_complete",
      constructionStatus: "not_established",
      statusLabel: "Development review · Review complete",
      referenceId: "PC25-579FSI",
      recordType: "Final Site Plan",
      reviewBody: "Planning Commission",
      summary: "Proposed 5,931sf addition to the existing building.",
    });
    expect(snapshot.records[0].lifecycle).not.toBe("approved");
    expect(snapshot.records[0].lifecycle).not.toBe("construction");
  });

  it("serves a bounded stale-good snapshot after a temporary source failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response([
          {
            type: "Feature",
            id: 1,
            geometry: point,
            properties: {
              OBJECTID: 1,
              PROJECT_NUMBER: "110008",
              PROJECT_NAME: "Salt Storage",
              STATUS: "Construction",
            },
          },
        ]),
      )
      .mockRejectedValueOnce(new Error("temporary outage"));
    vi.stubGlobal("fetch", fetchMock);

    const current = await getCityCapitalProjects();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
    const stale = await getCityCapitalProjects();

    expect(current.availability).toBe("available");
    expect(stale).toMatchObject({
      availability: "stale",
      provenance: {
        checkedAt: "2026-08-12T12:00:00.000Z",
        dataCheckedAt: "2026-08-11T12:00:00.000Z",
      },
    });
    expect(stale.records).toEqual(current.records);
  });

  it("paginates until ArcGIS says the collection is complete", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          [
            {
              type: "Feature",
              id: 1,
              geometry: point,
              properties: {
                OBJECTID: 1,
                PROJECT_NUMBER: "1",
                PROJECT_NAME: "First project",
                STATUS: "Planning",
              },
            },
          ],
          true,
        ),
      )
      .mockResolvedValueOnce(
        response([
          {
            type: "Feature",
            id: 2,
            geometry: {
              type: "Point",
              coordinates: [-77.42, 39.42],
            },
            properties: {
              OBJECTID: 2,
              PROJECT_NUMBER: "2",
              PROJECT_NAME: "Second project",
              STATUS: "Complete",
            },
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getCityCapitalProjects();
    expect(snapshot.records.map((record) => record.name)).toEqual([
      "First project",
      "Second project",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("resultOffset=500");
  });

  it("fails soft when a source is unavailable before a last-good fill", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("source unavailable");
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getCityCapitalProjects();
    expect(snapshot).toMatchObject({
      configured: true,
      availability: "unavailable",
      records: [],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
