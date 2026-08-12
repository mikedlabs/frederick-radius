import { describe, expect, it } from "vitest";
import { mapPinPlaces } from "./placePins";

describe("mapPinPlaces", () => {
  it("ships only the pin and decision fields the county map uses", () => {
    const places = mapPinPlaces(new Date("2026-08-11T16:00:00.000Z"));

    expect(places.length).toBeGreaterThan(1_000);
    expect(new Set(places.map((place) => place.slug)).size).toBe(places.length);
    for (const place of places) {
      expect(place.slug).toBeTruthy();
      expect(place.name).toBeTruthy();
      expect(Number.isFinite(place.geom.lng)).toBe(true);
      expect(Number.isFinite(place.geom.lat)).toBe(true);
      expect(place).not.toHaveProperty("google_photos");
      expect(place).not.toHaveProperty("google_hours");
      expect(place).not.toHaveProperty("hours");
      expect(place).not.toHaveProperty("description");
      expect(place).not.toHaveProperty("review_snippet");
      expect(place).not.toHaveProperty("phone");
      expect(place).not.toHaveProperty("website");
    }
  });

  it("reuses the same five-minute snapshot inside one server process", () => {
    const first = mapPinPlaces(new Date("2026-08-11T16:01:00.000Z"));
    const second = mapPinPlaces(new Date("2026-08-11T16:04:59.000Z"));

    expect(second).toBe(first);
  });
});
