import { describe, it, expect } from "vitest";
import { normalizeWaterSites } from "@/lib/integrations/usgsWater";

// Real USGS Instantaneous Values JSON shape (confirmed live against
// countyCd=24021). Each site appears once per parameter; coords for
// Frederick County are ~39.3-39.7 / -77.7--77.15.
function ts(opts: {
  code: string;
  name: string;
  lat: number;
  lng: number;
  param: string;
  values: Array<[string, string]>; // [value, dateTime]
  noData?: number;
}) {
  return {
    sourceInfo: {
      siteName: opts.name,
      siteCode: [{ value: opts.code }],
      geoLocation: { geogLocation: { latitude: opts.lat, longitude: opts.lng } },
    },
    variable: {
      variableCode: [{ value: opts.param }],
      noDataValue: opts.noData ?? -999999,
    },
    values: [{ value: opts.values.map(([value, dateTime]) => ({ value, dateTime })) }],
  };
}

const raw = {
  value: {
    timeSeries: [
      // Catoctin Creek — two parameters, two readings each. Must merge
      // into ONE site, taking the newest reading per parameter.
      ts({
        code: "01637500",
        name: "CATOCTIN CREEK NEAR MIDDLETOWN, MD",
        lat: 39.42725,
        lng: -77.55616667,
        param: "00060",
        values: [
          ["14.0", "2026-05-17T23:30:00.000-04:00"],
          ["16.0", "2026-05-17T23:45:00.000-04:00"],
        ],
      }),
      ts({
        code: "01637500",
        name: "CATOCTIN CREEK NEAR MIDDLETOWN, MD",
        lat: 39.42725,
        lng: -77.55616667,
        param: "00065",
        values: [
          ["1.50", "2026-05-17T23:30:00.000-04:00"],
          ["1.66", "2026-05-17T23:45:00.000-04:00"],
        ],
      }),
      // Monocacy — the most-recent gage-height reading is the USGS
      // no-data sentinel; must fall back to the prior valid reading,
      // and observedAt must be that valid reading's time.
      ts({
        code: "01643000",
        name: "MONOCACY RIVER AT BRIDGEPORT, MD",
        lat: 39.6,
        lng: -77.23,
        param: "00065",
        values: [
          ["3.20", "2026-05-17T23:30:00.000-04:00"],
          ["-999999", "2026-05-17T23:45:00.000-04:00"],
        ],
      }),
      // Out of county (Washington DC) -> dropped
      ts({
        code: "01646500",
        name: "POTOMAC RIVER NEAR WASH, DC",
        lat: 38.95,
        lng: -77.12,
        param: "00065",
        values: [["4.0", "2026-05-17T23:45:00.000-04:00"]],
      }),
      // Only no-data readings -> site has no usable value -> dropped
      ts({
        code: "01999999",
        name: "GHOST RUN NEAR NOWHERE, MD",
        lat: 39.5,
        lng: -77.4,
        param: "00060",
        values: [["-999999", "2026-05-17T23:45:00.000-04:00"]],
      }),
      // Nameless / codeless -> dropped
      ts({
        code: "",
        name: "",
        lat: 39.4,
        lng: -77.4,
        param: "00065",
        values: [["2.0", "2026-05-17T23:45:00.000-04:00"]],
      }),
    ],
  },
};

describe("normalizeWaterSites", () => {
  it("groups per-parameter series into one site with the newest readings", () => {
    const out = normalizeWaterSites(raw);
    const cat = out.find((x) => x.id === "01637500");
    expect(cat).toBeTruthy();
    expect(cat!.streamflowCfs).toBe(16);
    expect(cat!.gageHeightFt).toBe(1.66);
    expect(cat!.observedAt).toBe("2026-05-17T23:45:00.000-04:00");
    expect(cat!.river).toBe("CATOCTIN CREEK");
    expect(cat!.municipality).toBeTruthy();
  });

  it("skips USGS no-data sentinels and uses the latest VALID reading", () => {
    const mono = normalizeWaterSites(raw).find((x) => x.id === "01643000");
    expect(mono).toBeTruthy();
    expect(mono!.gageHeightFt).toBe(3.2);
    expect(mono!.observedAt).toBe("2026-05-17T23:30:00.000-04:00");
    expect(mono!.river).toBe("MONOCACY RIVER");
  });

  it("drops out-of-county, reading-less, and nameless sites", () => {
    const ids = normalizeWaterSites(raw).map((x) => x.id);
    expect(ids).toEqual(["01637500", "01643000"]); // sorted by name, only these
    expect(ids).not.toContain("01646500"); // DC
    expect(ids).not.toContain("01999999"); // no valid reading
  });

  it("sorts by site name", () => {
    const names = normalizeWaterSites(raw).map((x) => x.name);
    expect(names).toEqual([
      "CATOCTIN CREEK NEAR MIDDLETOWN, MD",
      "MONOCACY RIVER AT BRIDGEPORT, MD",
    ]);
  });

  it("returns [] for junk input", () => {
    expect(normalizeWaterSites(null)).toEqual([]);
    expect(normalizeWaterSites({})).toEqual([]);
    expect(normalizeWaterSites({ value: { timeSeries: "nope" } })).toEqual([]);
  });
});
