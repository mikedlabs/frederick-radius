import { describe, it, expect } from "vitest";
import { isUpcomingEvent, getVisibleEvents, hasImplausibleStartTime } from "./visible";

const now = new Date("2026-06-04T18:00:00-04:00"); // Thu Jun 4, 6pm ET

describe("isUpcomingEvent", () => {
  it("keeps a live event (started, not yet ended)", () => {
    expect(
      isUpcomingEvent(
        { starts_at: "2026-06-04T17:00:00-04:00", ends_at: "2026-06-04T20:00:00-04:00" },
        now,
      ),
    ).toBe(true);
  });

  it("keeps a future event", () => {
    expect(
      isUpcomingEvent(
        { starts_at: "2026-06-05T17:00:00-04:00", ends_at: "2026-06-05T20:00:00-04:00" },
        now,
      ),
    ).toBe(true);
  });

  it("drops an event that already ended", () => {
    expect(
      isUpcomingEvent(
        { starts_at: "2026-06-01T17:00:00-04:00", ends_at: "2026-06-01T20:00:00-04:00" },
        now,
      ),
    ).toBe(false);
  });

  it("drops a start-only event whose start is in the past", () => {
    expect(isUpcomingEvent({ starts_at: "2026-05-30T12:00:00-04:00" }, now)).toBe(false);
  });

  it("keeps a start-only event in the future", () => {
    expect(isUpcomingEvent({ starts_at: "2026-06-10T12:00:00-04:00" }, now)).toBe(true);
  });
});

describe("getVisibleEvents", () => {
  it("filters out past events and sorts soonest-first", () => {
    const out = getVisibleEvents(
      [
        { starts_at: "2026-06-10T12:00:00-04:00", ends_at: "2026-06-10T14:00:00-04:00" },
        { starts_at: "2026-06-01T12:00:00-04:00", ends_at: "2026-06-01T14:00:00-04:00" }, // past
        { starts_at: "2026-06-05T12:00:00-04:00", ends_at: "2026-06-05T14:00:00-04:00" },
      ],
      now,
    );
    expect(out.map((e) => e.starts_at)).toEqual([
      "2026-06-05T12:00:00-04:00",
      "2026-06-10T12:00:00-04:00",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [
      { starts_at: "2026-06-10T12:00:00-04:00" },
      { starts_at: "2026-06-01T12:00:00-04:00" },
    ];
    const copy = [...input];
    getVisibleEvents(input, now);
    expect(input).toEqual(copy);
  });
});

describe("hasImplausibleStartTime", () => {
  const at = (h: string) => `2026-06-13T${h}:00-04:00`;
  it("flags a pre-9-AM theater curtain (the 7 AM TED case)", () => {
    expect(hasImplausibleStartTime({ starts_at: at("07:00"), category: "theater" })).toBe(true);
    expect(hasImplausibleStartTime({ starts_at: at("00:30"), category: "music" })).toBe(true);
  });
  it("allows 9:00 AM exactly and evening curtains", () => {
    expect(hasImplausibleStartTime({ starts_at: at("09:00"), category: "theater" })).toBe(false);
    expect(hasImplausibleStartTime({ starts_at: at("20:00"), category: "music" })).toBe(false);
  });
  it("never touches early starts in plausible categories or all-day events", () => {
    expect(hasImplausibleStartTime({ starts_at: at("08:00"), category: "outdoors" })).toBe(false);
    expect(hasImplausibleStartTime({ starts_at: at("07:00"), category: "market" })).toBe(false);
    expect(hasImplausibleStartTime({ starts_at: at("07:00"), category: "theater", is_all_day: true })).toBe(false);
  });
  it("judges the EASTERN hour, not UTC", () => {
    // 11:00Z is 7 AM Eastern in June — implausible for theater.
    expect(hasImplausibleStartTime({ starts_at: "2026-06-13T11:00:00.000Z", category: "theater" })).toBe(true);
  });
  it("withholds the live feed's late-night Musical Storytime AM/PM error", () => {
    expect(
      hasImplausibleStartTime({
        title: "Musical Storytime",
        category: "music",
        starts_at: "2026-07-28T03:15:00.000Z",
        ends_at: "2026-07-28T15:45:00.000Z",
      }),
    ).toBe(true);
  });
  it("withholds an implausibly long routine program even when its start hour is plausible", () => {
    expect(
      hasImplausibleStartTime({
        title: "Preschool Storytime",
        starts_at: "2026-07-28T15:15:00.000Z",
        ends_at: "2026-07-29T15:45:00.000Z",
      }),
    ).toBe(true);
  });
  it("keeps legitimate evening family programs", () => {
    expect(
      hasImplausibleStartTime({
        title: "Pajama Storytime",
        starts_at: "2026-07-28T22:30:00.000Z",
        ends_at: "2026-07-28T23:15:00.000Z",
      }),
    ).toBe(false);
  });
  it("does not treat every preschool event as a routine storytime", () => {
    expect(
      hasImplausibleStartTime({
        title: "Preschool Family Camp-In",
        starts_at: "2026-07-29T01:30:00.000Z",
        ends_at: "2026-07-29T03:30:00.000Z",
      }),
    ).toBe(false);
  });
});
