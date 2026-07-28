import { describe, expect, it } from "vitest";
import type { FoodTruckScheduleStop } from "./schedule-types";
import {
  nextPublishedFoodTruckStop,
  todayFoodTruckStopDetail,
} from "./today-summary";

const NOW = new Date("2026-07-27T17:00:00.000Z"); // 1pm Eastern

function stop(
  id: string,
  startsAt: string,
  vendor = "The Alley Wagon",
  endsAt?: string,
): FoodTruckScheduleStop {
  return {
    id,
    title: vendor,
    startsAt,
    ...(endsAt ? { endsAt } : {}),
    venueName: "Steinhardt Brewing",
    vendors: [{ name: vendor }],
    sourceName: "Steinhardt Brewing",
    sourceUrl: "https://example.com/calendar",
    confidence: "venue",
  };
}

describe("nextPublishedFoodTruckStop", () => {
  it("selects the next named stop and skips past or malformed rows", () => {
    const next = nextPublishedFoodTruckStop(
      [
        stop("later", "2026-07-27T20:00:00.000Z"),
        stop("past", "2026-07-27T16:00:00.000Z"),
        stop("invalid", "not-a-date"),
        stop("next", "2026-07-27T18:00:00.000Z"),
      ],
      NOW,
    );

    expect(next).toEqual({
      truckName: "The Alley Wagon",
      venueName: "Steinhardt Brewing",
      startsAt: "2026-07-27T18:00:00.000Z",
      timing: "upcoming",
    });
  });

  it("keeps an already-started published stop until its valid end time", () => {
    const next = nextPublishedFoodTruckStop(
      [
        stop(
          "scheduled-now",
          "2026-07-27T16:00:00.000Z",
          "The Alley Wagon",
          "2026-07-27T19:00:00.000Z",
        ),
        stop("later", "2026-07-27T18:00:00.000Z"),
      ],
      NOW,
    );

    expect(next).toMatchObject({
      truckName: "The Alley Wagon",
      startsAt: "2026-07-27T16:00:00.000Z",
      endsAt: "2026-07-27T19:00:00.000Z",
      timing: "scheduled-now",
    });
    const detail = todayFoodTruckStopDetail(next!, NOW);
    expect(detail).toBe(
      "Scheduled now: The Alley Wagon at Steinhardt Brewing, through 3pm.",
    );
    expect(detail.toLowerCase()).not.toContain("live");
  });

  it("drops started stops without a valid future end time", () => {
    const next = nextPublishedFoodTruckStop(
      [
        stop("no-end", "2026-07-27T16:00:00.000Z"),
        stop(
          "expired",
          "2026-07-27T15:00:00.000Z",
          "Expired truck",
          "2026-07-27T16:30:00.000Z",
        ),
        stop(
          "bad-end",
          "2026-07-27T16:00:00.000Z",
          "Bad end truck",
          "not-a-date",
        ),
      ],
      NOW,
    );
    expect(next).toBeNull();
  });

  it("writes a short, Eastern-time Today line", () => {
    expect(
      todayFoodTruckStopDetail(
        {
          truckName: "The Alley Wagon",
          venueName: "Steinhardt Brewing",
          startsAt: "2026-07-27T18:00:00.000Z",
          timing: "upcoming",
        },
        NOW,
      ),
    ).toBe("Next: The Alley Wagon at Steinhardt Brewing, today at 2pm.");
  });
});
