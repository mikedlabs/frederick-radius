import { describe, expect, it } from "vitest";
import type { FoodTruckScheduleStop } from "./schedule-types";
import { prepareNearbyPublishedStops } from "./nearby";

function stop(
  id: string,
  startsAt: string,
  coordinates?: { lat: number; lng: number },
): FoodTruckScheduleStop {
  return {
    id,
    title: id,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 4 * 60 * 60 * 1000).toISOString(),
    venueName: id,
    ...coordinates,
    vendors: [{ name: `${id} truck` }],
    sourceName: `${id} source`,
    sourceUrl: `https://example.com/${id}`,
    confidence: "venue",
  };
}

describe("nearby published food-truck stops", () => {
  const now = new Date("2026-07-27T16:00:00.000Z");
  const downtown = { lat: 39.4143, lng: -77.4105 };
  const steinhardt = stop(
    "steinhardt",
    "2026-07-29T18:00:00.000Z",
    { lat: 39.4130741, lng: -77.403639 },
  );
  const springfield = stop(
    "springfield",
    "2026-07-28T18:00:00.000Z",
    { lat: 39.5589667, lng: -77.4346912 },
  );

  it("sorts stops in the same timing bucket by distance after location consent", () => {
    const result = prepareNearbyPublishedStops(
      [springfield, steinhardt],
      downtown,
      now,
    );
    expect(result.map((item) => item.id)).toEqual(["steinhardt", "springfield"]);
    expect(result[0].distance).toBeLessThan(result[1].distance!);
  });

  it("keeps scheduled-now and today stops ahead of closer later stops", () => {
    const scheduledNow = stop(
      "scheduled-now",
      "2026-07-27T14:00:00.000Z",
      { lat: 39.5589667, lng: -77.4346912 },
    );
    const today = stop(
      "today",
      "2026-07-27T20:00:00.000Z",
      { lat: 39.4402298, lng: -77.398855 },
    );
    const laterAndClosest = stop(
      "later",
      "2026-07-28T13:00:00.000Z",
      downtown,
    );
    const result = prepareNearbyPublishedStops(
      [laterAndClosest, today, scheduledNow],
      downtown,
      now,
    );

    expect(result.map((item) => item.id)).toEqual([
      "scheduled-now",
      "today",
      "later",
    ]);
    expect(result.map((item) => item.timing)).toEqual([
      "scheduled-now",
      "today",
      "later",
    ]);
  });

  it("uses start time as the tie-break for equally distant stops", () => {
    const earlier = stop(
      "earlier",
      "2026-07-28T17:00:00.000Z",
      downtown,
    );
    const later = stop(
      "later",
      "2026-07-28T20:00:00.000Z",
      downtown,
    );
    expect(
      prepareNearbyPublishedStops([later, earlier], downtown, now)
        .map((item) => item.id),
    ).toEqual(["earlier", "later"]);
  });

  it("sorts by published start time without a user location", () => {
    const result = prepareNearbyPublishedStops(
      [steinhardt, springfield],
      null,
      now,
    );
    expect(result.map((item) => item.id)).toEqual(["springfield", "steinhardt"]);
    expect(result.every((item) => item.distance === null)).toBe(true);
  });

  it("omits expired and ungeocoded entries", () => {
    const expired = stop(
      "expired",
      "2026-07-26T16:00:00.000Z",
      { lat: 39.4143, lng: -77.4105 },
    );
    const ungeocoded = stop("unknown", "2026-07-28T16:00:00.000Z");
    expect(
      prepareNearbyPublishedStops([expired, ungeocoded, steinhardt], downtown, now)
        .map((item) => item.id),
    ).toEqual(["steinhardt"]);
  });
});
