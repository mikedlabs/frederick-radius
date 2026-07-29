import { afterEach, describe, expect, it, vi } from "vitest";
import { getCountyFloodContext } from "./fcFloodRisk";
import { getPublicCountyParkAssets } from "./fcParkAssetsPublic";
import { getCountyPlanningApplications } from "./fcPlanningProjects";
import { getCountySnowRoutes } from "./fcSnowCommand";

const originalApproval = process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
const originalApprovedSources =
  process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;

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
});

describe("County ArcGIS requested-field allowlists", () => {
  it("never requests internal, contact, staff, fleet, cost, note, or maintenance fields", async () => {
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = "1";
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES = [
      "fc_planning_projects",
      "fc_snow_command",
      "fc_parks_assets",
      "fc_high_water",
    ].join(",");
    const fetchSpy = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({ type: "FeatureCollection", features: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const results = await Promise.all([
      getCountyPlanningApplications(),
      getCountySnowRoutes(),
      getPublicCountyParkAssets(),
      getCountyFloodContext(),
    ]);

    expect(results.every((result) => result.availability === "available")).toBe(true);
    const requestedFields = fetchSpy.mock.calls.flatMap((call) => {
      const raw = new URL(String(call[0])).searchParams.get("outFields") ?? "";
      return raw.split(",");
    });
    for (const forbidden of [
      "ApplicantEmail",
      "ApplicantPhone",
      "DRIVER",
      "TRUCK_ID",
      "TRUCK_TYPE",
      "PROPERTY_NUMBER",
      "COMMENT",
      "Notes",
      "CurrentInspectionNotes",
      "CurrentInspectionID",
      "TotalCost",
      "MaintainedBy",
      "OwnedBy",
      "created_user",
      "last_edited_user",
      "SIGN_ID",
      "GlobalID",
    ]) {
      expect(requestedFields).not.toContain(forbidden);
    }
  });
});
