import { afterEach, describe, expect, it, vi } from "vitest";
import { getLicensedFoodTruckRosterDocument } from "./fcFoodTruckRoster";
import { frederickCountySourceEnabled } from "./fcCountySource";

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

describe("Frederick County runtime integration gate", () => {
  it("keeps the attachment-bearing food-truck roster dark without approval", async () => {
    delete process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
    delete process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getLicensedFoodTruckRosterDocument();

    expect(result).toMatchObject({
      configured: false,
      availability: "disabled",
      records: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("runs public GIS by default while preserving a global kill switch", () => {
    delete process.env.FREDERICK_COUNTY_GIS_ENABLED;
    expect(frederickCountySourceEnabled("fc_planning_projects")).toBe(true);
    expect(frederickCountySourceEnabled("fc_snow_command")).toBe(true);
    expect(frederickCountySourceEnabled("fc_parks_assets")).toBe(true);
    expect(frederickCountySourceEnabled("fc_high_water")).toBe(true);

    process.env.FREDERICK_COUNTY_GIS_ENABLED = "0";
    expect(frederickCountySourceEnabled("fc_planning_projects")).toBe(false);
    expect(frederickCountySourceEnabled("fc_high_water")).toBe(false);
  });
});
