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
});
