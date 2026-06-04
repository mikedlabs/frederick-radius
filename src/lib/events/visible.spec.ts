import { describe, it, expect } from "vitest";
import { isUpcomingEvent, getVisibleEvents } from "./visible";

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
