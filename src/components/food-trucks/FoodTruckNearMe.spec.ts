import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FoodTruckScheduleStop } from "@/lib/food-trucks/schedule-types";
import FoodTruckNearMe, {
  canRequestFoodTruckLocation,
  foodTruckLocationActionLabel,
  foodTruckLocationFallback,
} from "./FoodTruckNearMe";

function scheduledStop(
  id: string,
  startsAt: string,
): FoodTruckScheduleStop {
  return {
    id,
    title: id,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 2 * 60 * 60 * 1000).toISOString(),
    venueName: `${id} venue`,
    lat: 39.4143,
    lng: -77.4105,
    vendors: [{
      name: `${id} truck`,
      slug: `${id}-truck`,
    }],
    sourceName: `${id} source`,
    sourceUrl: `https://example.com/${id}`,
    confidence: "venue",
  };
}

describe("FoodTruckNearMe", () => {
  it("renders three published previews and links known vendors to the roster", () => {
    const stops = [
      scheduledStop("first", "2026-07-27T18:00:00.000Z"),
      scheduledStop("second", "2026-07-27T19:00:00.000Z"),
      scheduledStop("third", "2026-07-27T20:00:00.000Z"),
      scheduledStop("fourth", "2026-07-28T18:00:00.000Z"),
    ];
    const html = renderToStaticMarkup(
      createElement(FoodTruckNearMe, {
        trucks: [],
        stops,
        asOf: "2026-07-27T16:00:00.000Z",
        accent: "#b4432d",
      }),
    );

    expect(html).toContain('href="#truck-first-truck"');
    expect(html).toContain("first truck");
    expect(html).toContain("second truck");
    expect(html).toContain("third truck");
    expect(html).not.toContain("fourth truck");
    expect(html).toContain("See the complete weekly schedule");
  });

  it("explains every location failure as a time-sorted fallback", () => {
    for (const status of ["denied", "unavailable", "error"] as const) {
      expect(foodTruckLocationFallback(status)?.toLowerCase()).toContain(
        "published stops are sorted by time",
      );
    }
    expect(foodTruckLocationFallback("idle")).toBeNull();
    expect(foodTruckLocationFallback("granted")).toBeNull();
  });

  it("offers retry for transient failures but not denied permission", () => {
    expect(canRequestFoodTruckLocation("error")).toBe(true);
    expect(canRequestFoodTruckLocation("unavailable")).toBe(true);
    expect(foodTruckLocationActionLabel("error")).toBe("Try again");
    expect(foodTruckLocationActionLabel("unavailable")).toBe("Try again");

    expect(canRequestFoodTruckLocation("denied")).toBe(false);
    expect(foodTruckLocationFallback("denied")).toContain("browser settings");
  });
});
