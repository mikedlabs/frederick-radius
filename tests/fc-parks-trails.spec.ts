import { describe, it, expect } from "vitest";
import { transform } from "../transforms/fc_parks_trails";
import { schema } from "../pipeline/schemas_ts/fc_parks_trails";

// Fixture, no live County data. Field names are the EXACT ArcGIS
// attribute names from the live layer metadata, so this exercises the
// real shape the worker will hand the transform on a CI run.
const raw = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: { type: "LineString", coordinates: [[-77.41, 39.41], [-77.40, 39.42]] },
      properties: {
        OBJECTID: 1,
        Trail_Name: "Catoctin Blue Trail",
        Park_Name: "Catoctin Mountain Park",
        Trail_System: "Catoctin",
        Trail_Desc: "A wooded ridge loop.",
        Status: "Open",
        ADA_Accessible: "No",
        Hiking: "Yes",
        Road_Cycling: "No",
        Mtn_Biking: "Yes",
        eBikes: "",
        Equestrian: null,
        Dogs_Allowed: "Yes",
        Motorcycles: "No",
        Surface_Type: "Natural",
        Paved: "No",
        Trail_Length_FT: 10560, // exactly 2 miles
        Trail_SkillLevel: "Intermediate",
        Trail_Type: "Loop",
        Owned_By: "Frederick County",
        Maintained_By: "Parks & Rec",
        Notes: null,
      },
    },
    {
      // No name in either field -> must be dropped, never fabricated.
      type: "Feature" as const,
      geometry: { type: "LineString", coordinates: [[-77.5, 39.5], [-77.5, 39.51]] },
      properties: { OBJECTID: 2, Trail_Name: "  ", Park_Name: null },
    },
    {
      // Null geometry -> dropped.
      type: "Feature" as const,
      geometry: null,
      properties: { OBJECTID: 3, Trail_Name: "Ghost Trail" },
    },
  ],
};

describe("fc_parks_trails transform", () => {
  it("accepts the real ArcGIS shape against the zod schema", () => {
    expect(schema.safeParse(raw).success).toBe(true);
  });

  it("normalizes a named trail and keeps its polyline geometry", () => {
    const out = transform(raw);
    expect(out.format).toBe("geojson");
    if (out.format !== "geojson") return;
    expect(out.data.features).toHaveLength(1);
    const f = out.data.features[0];
    expect(f.geometry).toEqual({
      type: "LineString",
      coordinates: [[-77.41, 39.41], [-77.40, 39.42]],
    });
    const p = f.properties;
    expect(p.name).toBe("Catoctin Blue Trail");
    expect(p.park).toBe("Catoctin Mountain Park");
    expect(p.length_mi).toBe(2);
    expect(p.surface).toBe("Natural");
    expect(p.paved).toBe(false);
    expect(p.ada_accessible).toBe(false);
    expect(p.dogs_allowed).toBe(true);
    expect(p.allowed_uses).toEqual(["hiking", "mountain_biking", "dogs"]);
    expect(p.skill_level).toBe("Intermediate");
    expect(p.source).toBe("fc_parks_trails");
  });

  it("drops nameless and geometry-less rows (no fabrication)", () => {
    const out = transform(raw);
    if (out.format !== "geojson") throw new Error("expected geojson");
    const names = out.data.features.map((f) => f.properties.name);
    expect(names).toEqual(["Catoctin Blue Trail"]);
  });

  it("leaves a flag undefined when the source is silent (no assumed No)", () => {
    const out = transform({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[-77.4, 39.4]] },
          properties: { Trail_Name: "Quiet Path" },
        },
      ],
    });
    if (out.format !== "geojson") throw new Error("expected geojson");
    expect(out.data.features[0].properties.ada_accessible).toBeUndefined();
    expect(out.data.features[0].properties.allowed_uses).toEqual([]);
  });
});
