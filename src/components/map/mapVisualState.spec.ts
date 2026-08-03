import { describe, expect, it } from "vitest";
import {
  mapPaintTransitionDuration,
  mapPlaceVisualState,
} from "./mapVisualState";

describe("map place visual state", () => {
  it("leaves every place neutral without a task", () => {
    expect(mapPlaceVisualState("gravel-and-grind", {
      amenitiesActive: false,
      matchSlugs: null,
    })).toEqual({ dimmed: false, emph: false });
  });

  it("emphasizes matches and recedes nonmatches", () => {
    const matches = new Set(["gravel-and-grind"]);
    expect(mapPlaceVisualState("gravel-and-grind", {
      amenitiesActive: false,
      matchSlugs: matches,
    })).toEqual({ dimmed: false, emph: true });
    expect(mapPlaceVisualState("starbucks", {
      amenitiesActive: false,
      matchSlugs: matches,
    })).toEqual({ dimmed: true, emph: false });
  });

  it("lets an amenity task lead over business pins", () => {
    expect(mapPlaceVisualState("gravel-and-grind", {
      amenitiesActive: true,
      matchSlugs: new Set(["gravel-and-grind"]),
    })).toEqual({ dimmed: true, emph: false });
  });

  it("removes paint transitions for reduced motion", () => {
    expect(mapPaintTransitionDuration(false)).toBe(180);
    expect(mapPaintTransitionDuration(true)).toBe(0);
  });
});
