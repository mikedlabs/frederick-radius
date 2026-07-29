import { describe, expect, it } from "vitest";
import { approvedCountyHealthEndpoints } from "./fcCountyHealth";

describe("approvedCountyHealthEndpoints", () => {
  it("probes all eight public GIS sources by default", () => {
    const endpoints = approvedCountyHealthEndpoints(undefined, undefined);
    expect(endpoints).toHaveLength(11);
    expect(new Set(endpoints.map((endpoint) => endpoint.sourceId))).toEqual(
      new Set([
        "fc_planning_projects",
        "fc_snow_command",
        "fc_parks_assets",
        "fc_high_water",
        "fc_municipal_boundaries",
        "fc_county_parks",
        "fc_park_trails",
        "fc_historic_cemeteries",
      ]),
    );
  });

  it("honors the public GIS incident kill switch", () => {
    expect(
      approvedCountyHealthEndpoints(undefined, undefined, "0"),
    ).toEqual([]);
    expect(
      approvedCountyHealthEndpoints("1", "fc_recreation_locations", "0"),
    ).toHaveLength(1);
  });

  it("adds only the explicitly approved gated source to the public probes", () => {
    const endpoints = approvedCountyHealthEndpoints(
      "1",
      "fc_recreation_locations",
    );
    expect(endpoints).toHaveLength(12);
    expect(
      endpoints.filter(
        (endpoint) => endpoint.sourceId === "fc_recreation_locations",
      ),
    ).toHaveLength(1);
    expect(endpoints.filter((endpoint) => {
      const url = new URL(endpoint.url);
      return (
        url.searchParams.get("returnGeometry") === "false"
        && url.searchParams.get("resultRecordCount") === "1"
      );
    })).toHaveLength(12);
  });

  it("covers every public flood layer without an approval record", () => {
    const endpoints = approvedCountyHealthEndpoints(
      undefined,
      undefined,
    );
    expect(
      endpoints
        .filter((endpoint) => endpoint.sourceId === "fc_high_water")
        .map((endpoint) => endpoint.group),
    ).toEqual([
      "County high-water areas",
      "County flood warning signs",
      "County past water rescues",
    ]);
  });
});
