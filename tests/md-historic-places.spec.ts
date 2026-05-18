import { describe, it, expect } from "vitest";
import { normalizeHistoricPlaces } from "@/lib/integrations/mdHistoricPlaces";

// Real Socrata GeoJSON shape (confirmed live against yf2f-by4g).
// Frederick County ~39.3-39.7 / -77.7--77.15. Geometry is
// (Multi)Polygon; polyPoint averages the outer ring.
function ring(cx: number, cy: number, r = 0.01) {
  return [
    [cx - r, cy - r],
    [cx + r, cy - r],
    [cx + r, cy + r],
    [cx - r, cy + r],
    [cx - r, cy - r],
  ];
}

const raw = {
  type: "FeatureCollection",
  features: [
    {
      geometry: { type: "MultiPolygon", coordinates: [[ring(-77.33, 39.7)]] },
      properties: {
        nrname: "Emmitsburg Historic District",
        altname: "Emmitsburg Town Center",
        category: "District",
        listeddate: "1992-03-10",
        nhl: "0",
        nrurl: "https://apps.mht.maryland.gov/NR/NRDetail.aspx?NRID=1098",
        natregid: "1098",
      },
    },
    {
      // altname == name -> dropped; bad listeddate; NHL; null url; Polygon
      geometry: { type: "Polygon", coordinates: [ring(-77.41, 39.41)] },
      properties: {
        nrname: "Monocacy National Battlefield",
        altname: "monocacy national battlefield",
        category: "Site",
        listeddate: "not a date",
        nhl: "1",
        nrurl: null,
        natregid: "0286",
      },
    },
    // nameless -> dropped
    {
      geometry: { type: "Polygon", coordinates: [ring(-77.4, 39.4)] },
      properties: { natregid: "999", category: "Building" },
    },
    // out of county (Baltimore) -> dropped
    {
      geometry: { type: "Polygon", coordinates: [ring(-76.61, 39.29)] },
      properties: { nrname: "Baltimore Shot Tower", natregid: "777" },
    },
    // geometry-less -> dropped
    {
      geometry: null,
      properties: { nrname: "Ghost Mill", natregid: "888" },
    },
    // duplicate natregid 1098 -> deduped
    {
      geometry: { type: "MultiPolygon", coordinates: [[ring(-77.33, 39.7)]] },
      properties: { nrname: "Emmitsburg Historic District (dupe)", natregid: "1098" },
    },
  ],
};

describe("normalizeHistoricPlaces", () => {
  it("parses name/altName/category/listedYear/NHL/url and a polygon point", () => {
    const out = normalizeHistoricPlaces(raw);
    const emm = out.find((h) => h.name === "Emmitsburg Historic District");
    expect(emm).toBeTruthy();
    expect(emm!.altName).toBe("Emmitsburg Town Center");
    expect(emm!.category).toBe("District");
    expect(emm!.listedYear).toBe("1992");
    expect(emm!.isNHL).toBe(false);
    expect(emm!.url).toContain("apps.mht.maryland.gov");
    expect(emm!.municipality).toBeTruthy();
    expect(emm!.lat).toBeCloseTo(39.7, 1);
    expect(emm!.id).toBe("mdnr-1098");
  });

  it("omits altName when it equals the name; handles bad date, NHL, null url", () => {
    const mon = normalizeHistoricPlaces(raw).find(
      (h) => h.name === "Monocacy National Battlefield",
    );
    expect(mon!.altName).toBeUndefined(); // case-insensitive equal -> omitted
    expect(mon!.listedYear).toBeUndefined(); // "not a date"
    expect(mon!.isNHL).toBe(true);
    expect(mon!.url).toBeUndefined(); // null nrurl
  });

  it("drops nameless, out-of-county, geometry-less; dedupes by natregid; sorts by name", () => {
    const names = normalizeHistoricPlaces(raw).map((h) => h.name);
    expect(names).toEqual([
      "Emmitsburg Historic District",
      "Monocacy National Battlefield",
    ]);
    expect(names).not.toContain("Baltimore Shot Tower");
    expect(names).not.toContain("Ghost Mill");
    expect(names).not.toContain("Emmitsburg Historic District (dupe)");
  });

  it("returns [] for junk input", () => {
    expect(normalizeHistoricPlaces(null)).toEqual([]);
    expect(normalizeHistoricPlaces({})).toEqual([]);
    expect(normalizeHistoricPlaces({ features: "nope" })).toEqual([]);
  });
});
