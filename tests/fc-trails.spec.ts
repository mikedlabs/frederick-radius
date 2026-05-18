import { describe, it, expect } from "vitest";
import { normalizeTrails } from "@/lib/integrations/fcTrails";

// Real ArcGIS field names (confirmed live in PR #23). Frederick County
// ~39.3-39.7 / -77.7--77.15.
const raw = {
  type: "FeatureCollection",
  features: [
    {
      geometry: { type: "LineString", coordinates: [[-77.41, 39.41], [-77.40, 39.42], [-77.39, 39.43]] },
      properties: {
        OBJECTID: 1,
        Trail_Name: "Catoctin Blue Trail",
        Park_Name: "Catoctin Mountain Park",
        Trail_System: "Catoctin",
        Surface_Type: "Natural",
        Trail_Length_FT: 10560,
        ADA_Accessible: "No",
        Hiking: "Yes",
        Mtn_Biking: "Yes",
        Dogs_Allowed: "Yes",
        Road_Cycling: "No",
        Paved: "No",
        Owned_By: "Frederick County",
        Trail_SkillLevel: "Intermediate",
      },
    },
    // nameless -> dropped
    { geometry: { type: "LineString", coordinates: [[-77.4, 39.4]] }, properties: { OBJECTID: 2 } },
    // out of county (Baltimore) -> dropped
    {
      geometry: { type: "LineString", coordinates: [[-76.61, 39.29], [-76.6, 39.3]] },
      properties: { OBJECTID: 3, Trail_Name: "Bmore Path" },
    },
    // no geometry -> dropped
    { geometry: null, properties: { OBJECTID: 4, Trail_Name: "Ghost Trail" } },
  ],
};

describe("normalizeTrails", () => {
  it("keeps in-county named trails, shaped + derived correctly", () => {
    const out = normalizeTrails(raw);
    expect(out).toHaveLength(1);
    const t = out[0];
    expect(t.name).toBe("Catoctin Blue Trail");
    expect(t.park).toBe("Catoctin Mountain Park");
    expect(t.surface).toBe("Natural");
    expect(t.lengthMi).toBe(2); // 10560 ft
    expect(t.ada).toBe(false);
    expect(t.dogsAllowed).toBe(true);
    expect(t.paved).toBe(false);
    expect(t.uses).toEqual(["hiking", "mountain biking", "dogs"]);
    expect(t.municipality).toBeTruthy();
    // midpoint of the 3-point line
    expect(t.lat).toBeCloseTo(39.42, 2);
  });

  it("drops nameless, out-of-county, and geometry-less features", () => {
    expect(normalizeTrails(raw).map((t) => t.name)).toEqual(["Catoctin Blue Trail"]);
  });

  it("returns [] for junk", () => {
    expect(normalizeTrails(null)).toEqual([]);
    expect(normalizeTrails({})).toEqual([]);
    expect(normalizeTrails({ features: "nope" })).toEqual([]);
  });

  it("leaves a flag undefined when the source is silent (no assumed No)", () => {
    const out = normalizeTrails({
      features: [
        {
          geometry: { type: "LineString", coordinates: [[-77.4, 39.4], [-77.4, 39.41]] },
          properties: { Trail_Name: "Quiet Path" },
        },
      ],
    });
    expect(out[0].ada).toBeUndefined();
    expect(out[0].uses).toEqual([]);
  });
});

import { trailShapesFC } from "@/lib/integrations/fcTrails";
describe("trailShapesFC (geometry foundation)", () => {
  it("keeps named in-county trail lines with geometry + light props", () => {
    const fc = trailShapesFC(raw);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1); // only the named, in-county, line-geom one
    const p = fc.features[0].properties as { name: string; surface: string };
    expect(p.name).toBe("Catoctin Blue Trail");
    expect(p.surface).toBe("Natural");
    expect(fc.features[0].geometry).toBeTruthy();
  });
  it("returns empty FC for junk", () => {
    expect(trailShapesFC({})).toEqual({ type: "FeatureCollection", features: [] });
  });
});
