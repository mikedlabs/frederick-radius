import { describe, expect, it } from "vitest";
import { dedupeAmenities, type Amenity } from "@/lib/loaders/amenities";

describe("amenity evidence dedupe", () => {
  it("prefers a field-mapped point over overlapping OSM data", () => {
    const rows: Amenity[] = [
      { id: "water-n-123", kind: "water", name: "Drinking water", municipality: "frederick", lng: -77.41, lat: 39.414 },
      { id: "field:abc", kind: "water", name: "Bottle filler", municipality: "frederick", lng: -77.41001, lat: 39.41401, photo: "https://example.com/field.jpg" },
    ];
    expect(dedupeAmenities(rows, [])).toEqual([rows[1]]);
  });

  it("keeps separate street assets that happen to sit on the same block", () => {
    const rows: Amenity[] = [
      { id: "field:bench-a", kind: "bench", name: "Bench by fountain", municipality: "frederick", lng: -77.41, lat: 39.414, photo: "https://example.com/a.jpg" },
      // Roughly 18m east: close enough for the former 45m blanket rule to
      // erase it, but plainly a second bench when both were field mapped.
      { id: "field:bench-b", kind: "bench", name: "Bench by crossing", municipality: "frederick", lng: -77.40979, lat: 39.414, photo: "https://example.com/b.jpg" },
    ];
    expect(dedupeAmenities(rows, [])).toEqual(rows);
  });

  it("still folds an OSM point into a nearly identical field observation", () => {
    const rows: Amenity[] = [
      { id: "osm-trash-1", kind: "trash", name: "Waste basket", municipality: "frederick", lng: -77.41, lat: 39.414 },
      { id: "field:trash-1", kind: "trash", name: "Carroll Creek trash can", municipality: "frederick", lng: -77.40999, lat: 39.41401, photo: "https://example.com/trash.jpg" },
    ];
    expect(dedupeAmenities(rows, [])).toEqual([rows[1]]);
  });

  it("keeps a playground point near a generic park with no playground evidence", () => {
    const playground: Amenity = {
      id: "osm-playground-1",
      kind: "playground",
      name: "Playground",
      municipality: "frederick",
      lng: -77.41,
      lat: 39.414,
    };
    expect(dedupeAmenities([playground], [{
      name: "Baker Park",
      category: "park",
      short_blurb: "A downtown park with a lake and tennis courts.",
      geom: { lng: -77.41001, lat: 39.41401 },
    }])).toEqual([playground]);
  });

  it("drops a playground point only when the nearby place proves it", () => {
    const playground: Amenity = {
      id: "osm-playground-2",
      kind: "playground",
      name: "Playground",
      municipality: "frederick",
      lng: -77.41,
      lat: 39.414,
    };
    expect(dedupeAmenities([playground], [{
      name: "Riverwalk Park",
      category: "park",
      short_blurb: "Park featuring a playground, pavilion, and picnic tables.",
      geom: { lng: -77.41001, lat: 39.41401 },
    }])).toEqual([]);
  });

  it("still folds a picnic point into a generic green-space place", () => {
    const picnic: Amenity = {
      id: "osm-picnic-1",
      kind: "picnic",
      name: "Picnic table",
      municipality: "frederick",
      lng: -77.41,
      lat: 39.414,
    };
    expect(dedupeAmenities([picnic], [{
      name: "Baker Park",
      category: "park",
      geom: { lng: -77.41001, lat: 39.41401 },
    }])).toEqual([]);
  });
});
