import { describe, it, expect, vi } from "vitest";

/**
 * Public art layer (6.5). The read path must be honest: only active,
 * placeable, in-county pieces render, and the GeoJSON shape is the one
 * the overlay and endpoint expect. The committed data ships empty, so
 * the loader is tested against an injected dataset here.
 */

vi.mock("@/data/public-art.json", () => ({
  default: {
    pieces: [
      // active + in county (downtown Frederick)
      { id: "a1", title: "Community Bridge", artist: "William Cochran", year: 1998, lat: 39.4143, lng: -77.4105, status: "active", source_url: "https://x" },
      // removed: must not render
      { id: "a2", title: "Gone Mural", artist: "Someone", lat: 39.41, lng: -77.41, status: "removed" },
      // out of county: must not render
      { id: "a3", title: "Baltimore Piece", artist: "Someone", lat: 39.29, lng: -76.61, status: "active" },
      // missing coordinates: must not render
      { id: "a4", title: "No Coords", artist: "Someone", status: "active" },
      // missing title: must not render
      { id: "a5", title: "", artist: "Someone", lat: 39.41, lng: -77.41, status: "active" },
    ],
  },
}));

const { getPublicArt, publicArtGeoJSON } = await import("@/lib/loaders/publicArt");

describe("public art loader (6.5)", () => {
  it("keeps only active, placeable, in-county pieces", () => {
    const art = getPublicArt();
    expect(art.map((p) => p.id)).toEqual(["a1"]);
  });

  it("emits GeoJSON with [lng, lat] points and the piece metadata in properties", () => {
    const fc = publicArtGeoJSON();
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0];
    expect(f.geometry.coordinates).toEqual([-77.4105, 39.4143]);
    expect(f.properties.title).toBe("Community Bridge");
    expect(f.properties.artist).toBe("William Cochran");
    // lat/lng live in geometry, not duplicated into properties.
    expect("lat" in f.properties).toBe(false);
    expect("lng" in f.properties).toBe(false);
  });
});
