import { describe, expect, it } from "vitest";
import { eatBeforeCategories, eatBeforePhrase } from "./event-pairings";
import type { PlaceCardData } from "@/lib/loaders/places";

describe("eatBeforeCategories", () => {
  it("drops coffee and bakery for a start at 5 PM Eastern or later", () => {
    for (const startsAt of [
      "2026-10-10T21:00:00.000Z", // 5:00 PM EDT
      "2026-10-11T00:30:00.000Z", // 8:30 PM EDT
      "2026-12-12T01:00:00.000Z", // 8:00 PM EST
    ]) {
      const categories = eatBeforeCategories({ starts_at: startsAt });
      expect([...categories].sort(), startsAt).toEqual(["bar", "brewery", "pizza", "restaurant"]);
    }
  });

  it("keeps the daytime set before 5 PM, for all-day rows, and without a start", () => {
    const daytime = ["bakery", "bar", "brewery", "coffee", "pizza", "restaurant"];
    // 4:59 PM EDT.
    expect([...eatBeforeCategories({ starts_at: "2026-10-10T20:59:00.000Z" })].sort()).toEqual(daytime);
    expect(
      [...eatBeforeCategories({ starts_at: "2026-10-11T00:30:00.000Z", is_all_day: true })].sort(),
    ).toEqual(daytime);
    expect([...eatBeforeCategories({})].sort()).toEqual(daytime);
    expect([...eatBeforeCategories({ starts_at: "not a date" })].sort()).toEqual(daytime);
  });
});

describe("eatBeforePhrase", () => {
  it("names the closest spot in a complete sentence", () => {
    const place = { name: "Cafe Nola", distance_m: 120 } as PlaceCardData;
    expect(eatBeforePhrase([place])).toMatch(/^Cafe Nola is .+ away in a straight line\. Check its hours for the event date\.$/);
  });
});
