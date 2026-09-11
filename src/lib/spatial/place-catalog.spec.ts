import { describe, expect, it } from "vitest";
import {
  hashSpatialPlaces,
  spatialCatalogSnapshot,
} from "./place-catalog";

describe("spatial place catalog", () => {
  it("builds one deterministic, coordinate-valid record per public slug", () => {
    const snapshot = spatialCatalogSnapshot();
    const slugs = snapshot.places.map((place) => place.slug);

    expect(snapshot.count).toBe(snapshot.places.length);
    expect(snapshot.count).toBeGreaterThan(1_500);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSpatialPlaces([...snapshot.places].reverse())).toBe(snapshot.hash);

    for (const place of snapshot.places) {
      expect(place.lng).toBeGreaterThanOrEqual(-180);
      expect(place.lng).toBeLessThanOrEqual(180);
      expect(place.lat).toBeGreaterThanOrEqual(-90);
      expect(place.lat).toBeLessThanOrEqual(90);
    }
  });

  it("changes the checksum when a public coordinate changes", () => {
    const snapshot = spatialCatalogSnapshot();
    const changed = snapshot.places.map((place, index) =>
      index === 0 ? { ...place, lng: place.lng + 0.0001 } : place,
    );

    expect(hashSpatialPlaces(changed)).not.toBe(snapshot.hash);
  });
});
