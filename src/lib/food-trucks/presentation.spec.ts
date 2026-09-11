import { describe, expect, it } from "vitest";
import {
  foodTruckInitials,
  foodTruckStopTiming,
  foodTruckStopDirectionsUrl,
  foodTruckVisualTone,
  prioritizeFoodTruckStops,
} from "./presentation";
import type { FoodTruckScheduleStop } from "./schedule-types";

function scheduleStop(
  id: string,
  startsAt: string,
  endsAt?: string,
): FoodTruckScheduleStop {
  return {
    id,
    title: id,
    startsAt,
    endsAt,
    venueName: `${id} venue`,
    vendors: [{ name: `${id} truck` }],
    sourceName: `${id} source`,
    sourceUrl: `https://example.com/${id}`,
    confidence: "venue",
  };
}

describe("food-truck presentation", () => {
  it("builds readable initials without spending a letter on a leading article", () => {
    expect(foodTruckInitials("The Alley Wagon")).toBe("AW");
    expect(foodTruckInitials("D's Delights")).toBe("DD");
    expect(foodTruckInitials("dōp Pizza")).toBe("DP");
    expect(foodTruckInitials("Fryday")).toBe("FR");
  });

  it("keeps each vendor on a stable app color token", () => {
    expect(foodTruckVisualTone("the-alley-wagon")).toBe(
      foodTruckVisualTone("the-alley-wagon"),
    );
    expect(foodTruckVisualTone("the-alley-wagon")).toMatch(/^var\(--app-/);
  });

  it("prefers the published stop address for directions", () => {
    expect(
      foodTruckStopDirectionsUrl({
        venueName: "Baker Park Bandshell",
        address: "121 N Bentz St, Frederick, MD 21701",
      }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=121%20N%20Bentz%20St%2C%20Frederick%2C%20MD%2021701",
    );
  });

  it("falls back to the venue name when the source has no address", () => {
    expect(
      foodTruckStopDirectionsUrl({ venueName: "Springfield Manor" }),
    ).toContain("destination=Springfield%20Manor");
  });

  it("classifies published stops without implying an open-ended stop is live", () => {
    const now = new Date("2026-08-02T23:50:00.000Z");

    expect(foodTruckStopTiming(scheduleStop(
      "active",
      "2026-08-02T23:00:00.000Z",
      "2026-08-03T00:30:00.000Z",
    ), now)).toBe("active");
    expect(foodTruckStopTiming(scheduleStop(
      "upcoming",
      "2026-08-03T01:00:00.000Z",
      "2026-08-03T02:00:00.000Z",
    ), now)).toBe("upcoming");
    expect(foodTruckStopTiming(scheduleStop(
      "ended",
      "2026-08-02T16:00:00.000Z",
      "2026-08-02T22:00:00.000Z",
    ), now)).toBe("ended");
    expect(foodTruckStopTiming(scheduleStop(
      "open-ended",
      "2026-08-02T16:00:00.000Z",
    ), now)).toBe("ended");
  });

  it("promotes active stops, keeps upcoming next, and retains source order within each state", () => {
    const now = new Date("2026-08-02T23:50:00.000Z");
    const endedFirst = scheduleStop(
      "ended-first",
      "2026-08-02T16:00:00.000Z",
      "2026-08-02T22:00:00.000Z",
    );
    const activeFirst = scheduleStop(
      "active-first",
      "2026-08-02T23:00:00.000Z",
      "2026-08-03T00:30:00.000Z",
    );
    const activeSecond = scheduleStop(
      "active-second",
      "2026-08-02T23:30:00.000Z",
      "2026-08-03T01:00:00.000Z",
    );
    const upcomingFirst = scheduleStop(
      "upcoming-first",
      "2026-08-03T01:00:00.000Z",
      "2026-08-03T02:00:00.000Z",
    );
    const upcomingSecond = scheduleStop(
      "upcoming-second",
      "2026-08-03T03:00:00.000Z",
      "2026-08-03T04:00:00.000Z",
    );
    const endedSecond = scheduleStop(
      "ended-second",
      "2026-08-01T16:00:00.000Z",
      "2026-08-01T22:00:00.000Z",
    );

    expect(prioritizeFoodTruckStops([
      endedFirst,
      activeFirst,
      upcomingFirst,
      activeSecond,
      endedSecond,
      upcomingSecond,
    ], now).map((stop) => stop.id)).toEqual([
      "active-first",
      "active-second",
      "upcoming-first",
      "upcoming-second",
      "ended-first",
      "ended-second",
    ]);
  });
});
