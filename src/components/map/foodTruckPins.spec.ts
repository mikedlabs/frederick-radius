import { describe, expect, it } from "vitest";
import type { FoodTruckMapPin } from "./types";
import { activeFoodTruckPins } from "./foodTruckPins";

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
