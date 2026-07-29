import { afterEach, describe, expect, it, vi } from "vitest";
import { frederickCountySourceEnabled } from "@/lib/integrations/fcCountySource";
import { fetchRecLocations } from "@/lib/integrations/fcRecLocations";

const originalMaster = process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
const originalSources =
  process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;
const originalPublicGisEnabled = process.env.FREDERICK_COUNTY_GIS_ENABLED;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalMaster == null) {
    delete process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
  } else {
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = originalMaster;
  }
  if (originalSources == null) {
    delete process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;
  } else {
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES = originalSources;
  }
  if (originalPublicGisEnabled == null) {
    delete process.env.FREDERICK_COUNTY_GIS_ENABLED;
  } else {
    process.env.FREDERICK_COUNTY_GIS_ENABLED = originalPublicGisEnabled;
  }
});

describe("older County GIS runtime adapters", () => {
  it("keeps the attachment-bearing recreation survey disabled without approval", async () => {
    delete process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
    delete process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const recreation = await fetchRecLocations();

    expect(recreation).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not let approval for a public GIS source unlock recreation data", async () => {
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = "1";
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES =
      "fc_planning_projects";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await fetchRecLocations();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enables the public legacy GIS adapters unless the kill switch is off", () => {
    delete process.env.FREDERICK_COUNTY_GIS_ENABLED;
    expect(frederickCountySourceEnabled("fc_municipal_boundaries")).toBe(true);
    expect(frederickCountySourceEnabled("fc_county_parks")).toBe(true);
    expect(frederickCountySourceEnabled("fc_park_trails")).toBe(true);
    expect(frederickCountySourceEnabled("fc_historic_cemeteries")).toBe(true);

    process.env.FREDERICK_COUNTY_GIS_ENABLED = "0";
    expect(frederickCountySourceEnabled("fc_municipal_boundaries")).toBe(false);
    expect(frederickCountySourceEnabled("fc_historic_cemeteries")).toBe(false);
  });
});
