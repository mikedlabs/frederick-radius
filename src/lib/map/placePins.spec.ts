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
      expect(place).not.toHaveProperty("address");
    }
  });

  it("adds a street line only to pins that share a name and a town, so no two rows read identically", () => {
    const places = mapPinPlaces(new Date("2026-08-11T16:00:00.000Z"));
    const sameNameAndTown = new Map<string, number>();
    const name = (place: (typeof places)[number]) => place.name.replace(/\s+/g, " ").trim().toLowerCase();
    const key = (place: (typeof places)[number]) => `${name(place)}|${place.municipality}`;
    for (const place of places) sameNameAndTown.set(key(place), (sameNameAndTown.get(key(place)) ?? 0) + 1);

    const qualified = places.filter((place) => "name_detail" in place);
    // The field is absent, not empty, everywhere else. Every byte here is
    // multiplied across the county payload, and a few dozen pins is the
    // ceiling for a list of chain stores.
    expect(qualified.length).toBeGreaterThan(0);
    expect(qualified.length).toBeLessThan(40);
    for (const place of qualified) {
      expect(sameNameAndTown.get(key(place))).toBeGreaterThan(1);
      expect(place.name_detail).toMatch(/\S/);
      expect(place.name_detail!.length).toBeLessThanOrEqual(48);
    }

    // Every pin that shares its name and town with another one is qualified,
    // including one whose address names no street (the helper numbers those).
    for (const place of places) {
      if (sameNameAndTown.get(key(place))! > 1) expect(place.name_detail, place.slug).toMatch(/\S/);
    }

    // What the reader sees on a row is the name and then this line, or the
    // town when there is none. Over every pin, no two rows may match.
    const rowText = new Map<string, string>();
    for (const place of places) {
      const text = `${name(place)}|${place.name_detail ?? place.municipality}`;
      expect(rowText.get(text), `${place.slug} reads like ${rowText.get(text)}`).toBeUndefined();
      rowText.set(text, place.slug);
    }

    const foodLions = places.filter((place) => place.name === "Food Lion" && place.municipality === "frederick");
    expect(foodLions.length).toBeGreaterThan(1);
    expect(new Set(foodLions.map((place) => place.name_detail)).size).toBe(foodLions.length);
    expect(foodLions.every((place) => /^\d+ \S/.test(place.name_detail ?? ""))).toBe(true);
  });

  it("reuses the same five-minute snapshot inside one server process", () => {
    const first = mapPinPlaces(new Date("2026-08-11T16:01:00.000Z"));
    const second = mapPinPlaces(new Date("2026-08-11T16:04:59.000Z"));

    expect(second).toBe(first);
  });
});
