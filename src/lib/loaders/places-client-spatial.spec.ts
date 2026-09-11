import { describe, expect, it } from "vitest";
import {
  clientPlaces,
  clientPlacesWithinRadius,
} from "./places-client";

describe("client place spatial override", () => {
  it("treats a checksum-verified PostGIS map as the radius candidate set", () => {
    const place = clientPlaces()[0];
    const result = clientPlacesWithinRadius(
      place.geom,
      500,
      new Map([[place.slug, 42]]),
    );

    expect(result.map((candidate) => candidate.slug)).toEqual([place.slug]);
    expect(result[0]?.distance_m).toBe(42);
  });

  it("returns no place candidates for a verified empty spatial result", () => {
    const place = clientPlaces()[0];
    expect(
      clientPlacesWithinRadius(place.geom, 500, new Map()),
    ).toEqual([]);
  });
});
