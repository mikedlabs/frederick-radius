import { describe, it, expect } from "vitest";
import { normalizeTransitRoutes } from "@/lib/integrations/transitFrederick";

// Socrata GeoJSON export shape (the_geom -> feature.geometry, other
// columns -> properties, lowercased/underscored).
const raw = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        type: "MultiLineString",
        coordinates: [[[-77.41, 39.41], [-77.40, 39.42]]],
      },
      properties: {
        route_id: "10",
        route_name: "Route 10 Golden Mile",
        destination: "Downtown Frederick",
        variation: "Inbound",
      },
    },
    // LineString geometry + Title-case keys (defensive path)
    {
      geometry: { type: "LineString", coordinates: [[-77.42, 39.43], [-77.43, 39.44]] },
      properties: { "Route ID": "20", "Route Name": "Route 20 Hospital", Destination: "FMH" },
    },
    // out of county (Baltimore) -> dropped
    {
      geometry: { type: "LineString", coordinates: [[-76.61, 39.29], [-76.6, 39.3]] },
      properties: { route_name: "Bmore Line" },
    },
    // nameless -> dropped
    { geometry: { type: "LineString", coordinates: [[-77.4, 39.4]] }, properties: { route_id: "x" } },
    // no geometry -> dropped
    { geometry: null, properties: { route_name: "Ghost Route" } },
  ],
};

describe("normalizeTransitRoutes", () => {
  it("keeps in-county named routes with a focus point", () => {
    const out = normalizeTransitRoutes(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "10",
      name: "Route 10 Golden Mile",
      destination: "Downtown Frederick",
      variation: "Inbound",
    });
    expect(out[0].lng).toBeCloseTo(-77.41, 2);
    expect(out[0].lat).toBeCloseTo(39.41, 2);
    // defensive Title-case path
    expect(out[1]).toMatchObject({ id: "20", name: "Route 20 Hospital", destination: "FMH" });
  });

  it("drops out-of-county, nameless, geometry-less", () => {
    expect(normalizeTransitRoutes(raw).map((r) => r.name)).toEqual([
      "Route 10 Golden Mile",
      "Route 20 Hospital",
    ]);
  });

  it("returns [] for junk", () => {
    expect(normalizeTransitRoutes(null)).toEqual([]);
    expect(normalizeTransitRoutes({})).toEqual([]);
    expect(normalizeTransitRoutes({ features: 5 })).toEqual([]);
  });
});
