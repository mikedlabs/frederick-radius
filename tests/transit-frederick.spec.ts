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

// July 2026 Socrata schema: no route_name column anymore — rt_long_nm
// carries a segment-level long name and route_id the short code. The
// normalizer maps ids to the county's canonical route names (so the
// page's group-by-name collapses segments), disambiguates the shared
// "MTM" id into its two real shuttles, and keeps distinct segments
// (same id + variation) as separate variations.
const raw2026 = {
  type: "FeatureCollection",
  features: [
    {
      geometry: { type: "MultiLineString", coordinates: [[[-77.411, 39.412], [-77.42, 39.39]]] },
      properties: { route_id: "15", rt_long_nm: "#15 route alternate segment 1", objectid: "0" },
    },
    {
      geometry: { type: "MultiLineString", coordinates: [[[-77.41, 39.41], [-77.4, 39.42]]] },
      properties: { route_id: "65", rt_long_nm: "#65/Walkersville Connector", destination: "Loop", objectid: "1" },
    },
    {
      geometry: { type: "MultiLineString", coordinates: [[[-77.42, 39.43], [-77.43, 39.44]]] },
      properties: { route_id: "65", rt_long_nm: "#65 route alternate segment 1", variation: "Riverside Corp. Park", objectid: "24" },
    },
    {
      geometry: { type: "MultiLineString", coordinates: [[[-77.44, 39.45], [-77.45, 39.46]]] },
      properties: { route_id: "65", rt_long_nm: "#65 route alternate segment 2", variation: "Riverside Corp. Park", objectid: "25" },
    },
    {
      geometry: { type: "MultiLineString", coordinates: [[[-77.53, 39.27], [-77.54, 39.28]]] },
      properties: { route_id: "MTM", rt_long_nm: "Point of Rocks Meet-the-MARC shuttle", objectid: "30" },
    },
    {
      geometry: { type: "MultiLineString", coordinates: [[[-77.35, 39.48], [-77.36, 39.49]]] },
      properties: { route_id: "MTM", rt_long_nm: "Walkersville Meet-the-MARC shuttle a.m.", objectid: "31" },
    },
    // unknown id → falls back to the long name, segment suffix stripped
    {
      geometry: { type: "MultiLineString", coordinates: [[[-77.4, 39.4], [-77.41, 39.41]]] },
      properties: { route_id: "ZZZ", rt_long_nm: "#99 route alternate segment 3", objectid: "40" },
    },
  ],
};

describe("normalizeTransitRoutes — 2026 schema (rt_long_nm)", () => {
  it("maps route_id to the county's canonical route names", () => {
    const out = normalizeTransitRoutes(raw2026);
    const names = out.map((r) => r.name);
    expect(names).toContain("15 Connector");
    expect(names.filter((n) => n === "65 Connector")).toHaveLength(3);
  });

  it("keeps same-id segments as distinct variations (no dedupe collapse)", () => {
    const out = normalizeTransitRoutes(raw2026);
    expect(out.filter((r) => r.id === "65")).toHaveLength(3);
  });

  it("splits the shared MTM id into its two real shuttles", () => {
    const names = normalizeTransitRoutes(raw2026).map((r) => r.name);
    expect(names).toContain("Point of Rocks Meet-the-MARC Shuttle");
    expect(names).toContain("Walkersville Meet-the-MARC Shuttle");
  });

  it("unknown ids fall back to the cleaned long name", () => {
    const names = normalizeTransitRoutes(raw2026).map((r) => r.name);
    expect(names).toContain("99");
  });
});

import { transitRouteShapesFC } from "@/lib/integrations/transitFrederick";
describe("transitRouteShapesFC (geometry foundation)", () => {
  it("keeps in-county route lines with light props, drops the rest", () => {
    const fc = transitRouteShapesFC(raw);
    expect(fc.type).toBe("FeatureCollection");
    // raw has 1 MultiLineString in-county (#10) + 1 LineString in-county
    // (#20) + 1 out-of-county + nameless(LineString in-county, no name
    // ok for shapes? shapes keep geometry regardless of name) + null geom
    const names = fc.features.map((f) => (f.properties as { name: string }).name);
    expect(fc.features.length).toBeGreaterThanOrEqual(2);
    expect(names).toContain("Route 10 Golden Mile");
    expect(fc.features.every((f) => f.geometry)).toBe(true);
  });
  it("returns empty FC for junk", () => {
    expect(transitRouteShapesFC(null)).toEqual({ type: "FeatureCollection", features: [] });
  });
});

// Stops loader (added Proposal D — MD Open Data 4zcx-89nc).
import { normalizeTransitStops } from "@/lib/integrations/transitFrederick";

const stopsRaw = {
  type: "FeatureCollection",
  features: [
    // Point geometry, lowercased Socrata keys — standard happy path.
    {
      geometry: { type: "Point", coordinates: [-77.41, 39.41] },
      properties: { objectid: "1", stop_name: "South Market @ Patrick" },
    },
    // Title-case keys (defensive path)
    {
      geometry: { type: "Point", coordinates: [-77.42, 39.42] },
      properties: { "Stop ID": "2", "Stop Name": "Carroll Creek @ East St" },
    },
    // Out of county — dropped
    {
      geometry: { type: "Point", coordinates: [-76.61, 39.29] },
      properties: { objectid: "3", stop_name: "Baltimore Stop" },
    },
    // Missing name — dropped
    {
      geometry: { type: "Point", coordinates: [-77.4, 39.4] },
      properties: { objectid: "4" },
    },
    // Wrong geometry type — dropped
    {
      geometry: { type: "LineString", coordinates: [[-77.4, 39.4]] },
      properties: { objectid: "5", stop_name: "Linestring Stop" },
    },
    // Duplicate id — kept once
    {
      geometry: { type: "Point", coordinates: [-77.41, 39.41] },
      properties: { objectid: "1", stop_name: "Duplicate" },
    },
  ],
};

describe("normalizeTransitStops", () => {
  it("keeps in-county named stops with point geometry", () => {
    const out = normalizeTransitStops(stopsRaw);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "1",
      name: "South Market @ Patrick",
      lng: -77.41,
      lat: 39.41,
    });
    expect(out[1]).toMatchObject({
      id: "2",
      name: "Carroll Creek @ East St",
    });
  });

  it("drops out-of-county / nameless / non-point / duplicate", () => {
    const out = normalizeTransitStops(stopsRaw);
    const names = out.map((s) => s.name);
    expect(names).not.toContain("Baltimore Stop");
    expect(names).not.toContain("Linestring Stop");
    expect(names).not.toContain("Duplicate");
  });

  it("returns [] for junk", () => {
    expect(normalizeTransitStops(null)).toEqual([]);
    expect(normalizeTransitStops({})).toEqual([]);
    expect(normalizeTransitStops({ features: "nope" })).toEqual([]);
  });
});
