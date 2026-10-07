import { describe, expect, it } from "vitest";
import type { FoodTruckMapPin } from "./types";
import {
  activeFoodTruckPins,
  foodTruckPinsForOverview,
  scheduledFoodTruckLabel,
} from "./foodTruckPins";

const pin: FoodTruckMapPin = {
  id: "beacon:test-truck",
  slug: "test-truck",
  name: "Test Truck",
  cuisine: "Lunch",
  lat: 39.414,
  lng: -77.41,
  href: "/food-trucks#truck-test-truck",
  availability: "operator-live",
  startedAt: "2026-07-22T16:00:00.000Z",
  expiresAt: "2026-07-22T20:00:00.000Z",
  sourceName: "Operator live beacon",
  sourceUrl: "/food-trucks#truck-test-truck",
};

describe("active food-truck map pins", () => {
  it("shows a pin only inside its operator-confirmed window", () => {
    expect(activeFoodTruckPins([pin], Date.parse("2026-07-22T18:00:00.000Z"))).toEqual([pin]);
    expect(activeFoodTruckPins([pin], Date.parse(pin.expiresAt))).toEqual([]);
  });

  it("drops malformed windows", () => {
    expect(activeFoodTruckPins([{ ...pin, expiresAt: "bad" }], Date.now())).toEqual([]);
  });

  it("shows a published stop before and during its stated window without calling it live", () => {
    const scheduled: FoodTruckMapPin = {
      id: "schedule:test-stop:test-truck",
      slug: "test-truck",
      name: "Test Truck",
      cuisine: "Lunch",
      lat: 39.414,
      lng: -77.41,
      href: "/food-trucks#truck-test-truck",
      availability: "published-stop",
      venueName: "Test Venue",
      startedAt: "2026-07-22T18:00:00.000Z",
      expiresAt: "2026-07-22T21:00:00.000Z",
      sourceName: "Test Venue",
      sourceUrl: "https://example.com/schedule",
      sourceConfidence: "venue",
    };

    expect(activeFoodTruckPins(
      [scheduled],
      Date.parse("2026-07-22T17:00:00.000Z"),
    )).toEqual([scheduled]);
    expect(activeFoodTruckPins(
      [scheduled],
      Date.parse("2026-07-22T19:00:00.000Z"),
    )).toEqual([scheduled]);
    expect(activeFoodTruckPins(
      [scheduled],
      Date.parse(scheduled.expiresAt!),
    )).toEqual([]);
  });

  it("keeps a stop 19 hours ahead off the untouched county overview", () => {
    // The Oct 2026 audit: the cold open's only mark was tomorrow's lunch stop.
    const tomorrowLunch: FoodTruckMapPin = {
      id: "schedule:lunch:test-truck",
      slug: "test-truck",
      name: "Test Truck",
      cuisine: "Lunch",
      lat: 39.414,
      lng: -77.41,
      href: "/food-trucks#truck-test-truck",
      availability: "published-stop",
      venueName: "Test Venue",
      // Wed Oct 7, 11 AM to 2 PM Eastern.
      startedAt: "2026-10-07T15:00:00.000Z",
      expiresAt: "2026-10-07T18:00:00.000Z",
      sourceName: "Test Venue",
      sourceUrl: "https://example.com/schedule",
      sourceConfidence: "venue",
    };
    // Tue Oct 6, 4 PM Eastern: 19 hours ahead. Still listed off the overview.
    const evening = Date.parse("2026-10-06T20:00:00.000Z");
    expect(activeFoodTruckPins([tomorrowLunch], evening)).toEqual([tomorrowLunch]);
    expect(foodTruckPinsForOverview([tomorrowLunch], evening)).toEqual([]);
    // Two hours before the start it joins the overview, and stays until it ends.
    expect(foodTruckPinsForOverview(
      [tomorrowLunch],
      Date.parse("2026-10-07T13:00:00.000Z"),
    )).toEqual([tomorrowLunch]);
    expect(foodTruckPinsForOverview(
      [tomorrowLunch],
      Date.parse("2026-10-07T17:59:00.000Z"),
    )).toEqual([tomorrowLunch]);
    expect(foodTruckPinsForOverview(
      [tomorrowLunch],
      Date.parse("2026-10-07T18:00:00.000Z"),
    )).toEqual([]);
    // An operator beacon keeps its own confirmed window on the overview.
    expect(foodTruckPinsForOverview([pin], Date.parse("2026-07-22T18:00:00.000Z"))).toEqual([pin]);
  });

  it("labels a published stop as scheduled with its start time", () => {
    const now = new Date("2026-10-06T19:00:00.000Z"); // Tue 3 PM Eastern
    expect(scheduledFoodTruckLabel({ startedAt: "2026-10-06T21:00:00.000Z" }, now))
      .toBe("Scheduled 5 PM");
    expect(scheduledFoodTruckLabel({ startedAt: "2026-10-06T21:30:00.000Z" }, now))
      .toBe("Scheduled 5:30 PM");
    expect(scheduledFoodTruckLabel({ startedAt: "2026-10-08T15:00:00.000Z" }, now))
      .toBe("Scheduled Thu 11 AM");
    expect(scheduledFoodTruckLabel({ startedAt: "not a date" }, now)).toBeNull();
  });

  it("does not keep a no-end published stop after its start time", () => {
    const scheduled: FoodTruckMapPin = {
      id: "schedule:test-stop:guest",
      slug: "scheduled-test-stop-guest",
      name: "Guest Truck",
      cuisine: "Food truck",
      lat: 39.414,
      lng: -77.41,
      href: "/food-trucks#this-week",
      availability: "published-stop",
      venueName: "Test Venue",
      startedAt: "2026-07-22T18:00:00.000Z",
      sourceName: "Test Venue",
      sourceUrl: "https://example.com/schedule",
      sourceConfidence: "venue",
    };
    expect(activeFoodTruckPins(
      [scheduled],
      Date.parse("2026-07-22T17:00:00.000Z"),
    )).toEqual([scheduled]);
    expect(activeFoodTruckPins(
      [scheduled],
      Date.parse("2026-07-22T18:00:00.000Z"),
    )).toEqual([scheduled]);
    expect(activeFoodTruckPins(
      [scheduled],
      Date.parse("2026-07-22T18:00:00.001Z"),
    )).toEqual([]);
  });
});
