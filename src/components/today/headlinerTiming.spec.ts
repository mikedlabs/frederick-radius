import { describe, expect, it } from "vitest";
import { shouldPromoteTodayHeadliner } from "./headlinerTiming";

describe("Today headliner timing", () => {
  it("keeps an evening draw compact during the morning", () => {
    expect(
      shouldPromoteTodayHeadliner(
        { starts_at: "2026-07-29T23:00:00.000Z" },
        new Date("2026-07-29T12:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("promotes a useful event that begins within four hours", () => {
    expect(
      shouldPromoteTodayHeadliner(
        { starts_at: "2026-07-29T17:00:00.000Z" },
        new Date("2026-07-29T14:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("keeps a major Carroll Creek event highlighted across its whole day", () => {
    expect(
      shouldPromoteTodayHeadliner(
        {
          starts_at: "2026-08-22T16:00:00.000Z",
          ends_at: "2026-08-22T22:00:00.000Z",
          venue_place_slug: "carroll-creek-outdoor-amphitheater",
          venue_name: "Carroll Creek Outdoor Amphitheater",
        },
        new Date("2026-08-22T10:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("promotes an event that is already live", () => {
    expect(
      shouldPromoteTodayHeadliner(
        {
          starts_at: "2026-07-29T17:00:00.000Z",
          ends_at: "2026-07-29T20:00:00.000Z",
        },
        new Date("2026-07-29T18:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("promotes an all-day event without inventing a countdown", () => {
    expect(
      shouldPromoteTodayHeadliner(
        { starts_at: "2026-07-29T04:00:00.000Z", is_all_day: true },
        new Date("2026-07-29T13:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("rejects an invalid event time", () => {
    expect(
      shouldPromoteTodayHeadliner(
        { starts_at: "not-a-date" },
        new Date("2026-07-29T13:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
