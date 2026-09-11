import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TodayLocalGuides, {
  TodayFoodTruckGuide,
  foodTruckGuideCopy,
  type TodayFoodTruckGuideProps,
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
});

describe("TodayLocalGuides hierarchy", () => {
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
});
