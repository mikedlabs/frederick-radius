import { describe, expect, it } from "vitest";
import {
  shouldOfferMapLocationForUrl,
  shouldShowMapLocationIntro,
} from "./mapLocationIntro";

describe("map location introduction", () => {
  const firstVisit = {
    isBrowseMap: true,
    permissionChecked: true,
    hasLocation: false,
    availability: "requestable" as const,
    dismissed: false,
  };

  it("offers a location choice only after a silent permission check", () => {
    expect(shouldShowMapLocationIntro(firstVisit)).toBe(true);
    expect(
      shouldShowMapLocationIntro({ ...firstVisit, permissionChecked: false }),
    ).toBe(false);
  });

  it("stays out of the way after a decision, a fix, or an unavailable browser", () => {
    expect(
      shouldShowMapLocationIntro({ ...firstVisit, dismissed: true }),
    ).toBe(false);
    expect(
      shouldShowMapLocationIntro({ ...firstVisit, hasLocation: true }),
    ).toBe(false);
    expect(
      shouldShowMapLocationIntro({
        ...firstVisit,
        availability: "unavailable",
      }),
    ).toBe(false);
    expect(
      shouldShowMapLocationIntro({ ...firstVisit, isBrowseMap: false }),
    ).toBe(false);
  });

  it("stays off explicit map tasks while allowing ordinary tracking parameters", () => {
    expect(shouldOfferMapLocationForUrl(new URLSearchParams())).toBe(true);
    expect(
      shouldOfferMapLocationForUrl(new URLSearchParams("utm_source=shared")),
    ).toBe(true);
    for (const query of [
      "c=-77.6196,39.4705,8.63",
      "show=transit",
      "music=tonight&t=weekend",
      "place=gravel-and-grind-frederick",
    ]) {
      expect(shouldOfferMapLocationForUrl(new URLSearchParams(query))).toBe(
        false,
      );
    }
  });
});
