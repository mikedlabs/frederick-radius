import { describe, expect, it } from "vitest";
import {
  normalizeMapReturnTo,
  withMapReturnTo,
  withMapSearchQuery,
} from "./map-return";

describe("map return paths", () => {
  it("preserves an exact map camera, layer set, and search query", () => {
    const returnTo =
      "/map?c=-77.4100%2C39.4150%2C12.40&show=transit&layers=radar&q=coffee";

    expect(normalizeMapReturnTo(returnTo)).toBe(returnTo);
    expect(withMapReturnTo("/places/gravel-and-grind-frederick", returnTo)).toBe(
      "/places/gravel-and-grind-frederick?returnTo=%2Fmap%3Fc%3D-77.4100%252C39.4150%252C12.40%26show%3Dtransit%26layers%3Dradar%26q%3Dcoffee",
    );
  });

  it.each([
    "https://example.com/map",
    "//example.com/map",
    "/maps?c=1,2,3",
    "/maple",
    "/places/example",
    "/%2Fmap?c=1,2,3",
    "",
  ])("rejects a non-map or unsafe return target: %s", (value) => {
    expect(normalizeMapReturnTo(value)).toBeNull();
  });

  it("does not attach an invalid return target", () => {
    expect(
      withMapReturnTo("/places/gravel-and-grind-frederick", "https://example.com/map"),
    ).toBe("/places/gravel-and-grind-frederick");
  });

  it("merges the authoritative full-search query into a valid map return", () => {
    expect(
      withMapSearchQuery(
        "/map?c=-77.4100%2C39.4150%2C12.4&layers=parks",
        " coffee ",
      ),
    ).toBe(
      "/map?c=-77.4100%2C39.4150%2C12.4&layers=parks&q=coffee",
    );
    expect(withMapSearchQuery("https://example.com/map", "coffee")).toBeNull();
  });
});
