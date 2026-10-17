import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// A client guide must consume scalar counts, even through indirect imports.
// Rejecting these modules makes an accidental catalog import fail this suite.
vi.mock("@/data/beers", () => { throw new Error("The client guide must not load the beer catalog."); });
vi.mock("@/data/food-trucks", () => { throw new Error("The client guide must not load the truck catalog."); });
import TodayLocalGuides, {
  TodayFoodTruckGuide,
  foodTruckGuideCopy,
  type TodayFoodTruckGuideProps,
  type TodayLocalGuidesProps,
} from "./TodayLocalGuides";

const NEXT = {
  truckName: "The Alley Wagon",
  venueName: "Steinhardt Brewing",
  startsAt: "2026-07-27T20:00:00.000Z",
};
const AS_OF = "2026-07-27T17:00:00.000Z";

describe("foodTruckGuideCopy", () => {
  it("surfaces the next published stop when no operator is live", () => {
    expect(foodTruckGuideCopy(0, NEXT, AS_OF)).toEqual({
      href: "/food-trucks#this-week",
      detail:
        "Next: The Alley Wagon at Steinhardt Brewing, today at 4pm.",
      state: "scheduled",
    });
  });

  it("lets a verified live pin win over the published schedule", () => {
    expect(foodTruckGuideCopy(1, NEXT, AS_OF)).toEqual({
      href: "/food-trucks#near-me",
      detail: "1 truck is sharing a live location.",
      state: "live",
    });
  });

  it("uses the supplied roster count only when neither live nor scheduled information is available", () => {
    expect(foodTruckGuideCopy(0, null, AS_OF, 23)).toEqual({
      href: "/food-trucks", detail: "See published stops and browse 23 local vendors.", state: "roster",
    });
    expect(foodTruckGuideCopy(0, NEXT, AS_OF, 23).detail).toBe("Next: The Alley Wagon at Steinhardt Brewing, today at 4pm.");
    expect(foodTruckGuideCopy(1, NEXT, AS_OF, 23).detail).toBe("1 truck is sharing a live location.");
  });

  it("does not describe an omitted count as zero vendors", () => {
    expect(foodTruckGuideCopy(0, null).detail).toBe("See published stops and browse local vendors.");
  });
});

describe("TodayLocalGuides hierarchy", () => {
  it("does not import the beer or food-truck catalogs into the client island", () => {
    const source = readFileSync("src/components/today/TodayLocalGuides.tsx", "utf8");
    expect(source).not.toContain("@/data/beers");
    expect(source).not.toContain("@/data/food-trucks");
    expect(source).toContain("breweryCount");
  });

  it("uses the parent Around town chapter as its only visible heading", () => {
    const html = renderToStaticMarkup(createElement(TodayLocalGuides));

    expect(html).toContain('aria-label="Local guides"');
    expect(html).not.toMatch(/<h[1-6][^>]*>\s*Local guides\s*<\/h[1-6]>/);
  });

  it("turns a stored next stop into a direct schedule route with useful copy", () => {
    const html = renderToStaticMarkup(
      createElement<TodayFoodTruckGuideProps>(TodayFoodTruckGuide, {
        nextFoodTruckStop: NEXT,
        asOf: AS_OF,
      }),
    );

    expect(html).toContain('href="/food-trucks#this-week"');
    expect(html).toContain(
      "Next: The Alley Wagon at Steinhardt Brewing, today at 4pm.",
    );
  });

  it("renders server-supplied guide counts without either catalog", () => {
    const html = renderToStaticMarkup(createElement<TodayLocalGuidesProps>(TodayLocalGuides, { breweryCount: 19, foodTruckCount: 23 }));
    expect(html).toContain("Browse 19 breweries and current taproom listings.");
    expect(html).toContain("See published stops and browse 23 local vendors.");
    expect(html).toContain('href="/beer"');
    expect(html).toContain('href="/food-trucks"');
  });
});
