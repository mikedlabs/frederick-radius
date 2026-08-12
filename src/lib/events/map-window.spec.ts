import { describe, expect, it } from "vitest";
import { eventMatchesMapNowWindow } from "./map-window";

const NOW = new Date("2026-07-30T11:31:00-04:00");

describe("eventMatchesMapNowWindow", () => {
  it("includes a confirmed event whose real window contains now", () => {
    expect(
      eventMatchesMapNowWindow(
        {
          starts_at: "2026-07-30T11:00:00-04:00",
          ends_at: "2026-07-30T13:00:00-04:00",
        },
        NOW,
      ),
    ).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["equal to its start", "2026-07-30T09:15:00-04:00"],
    ["an end-of-day sentinel", "2026-07-30T23:59:00-04:00"],
  ])("does not treat a started event with %s end as live", (_label, ends_at) => {
    expect(
      eventMatchesMapNowWindow(
        { starts_at: "2026-07-30T09:15:00-04:00", ends_at },
        NOW,
      ),
    ).toBe(false);
  });

  it("still includes a future event starting soon without calling it live", () => {
    expect(
      eventMatchesMapNowWindow(
        { starts_at: "2026-07-30T12:15:00-04:00" },
        NOW,
      ),
    ).toBe(true);
  });

  it("never treats an all-day event as happening now", () => {
    expect(
      eventMatchesMapNowWindow(
        {
          starts_at: "2026-07-30T00:00:00-04:00",
          ends_at: "2026-07-31T00:00:00-04:00",
          is_all_day: true,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("does not put a future all-day row into the starting-soon window", () => {
    expect(
      eventMatchesMapNowWindow(
        {
          starts_at: "2026-07-30T12:00:00-04:00",
          ends_at: "2026-07-31T00:00:00-04:00",
          is_all_day: true,
        },
        NOW,
      ),
    ).toBe(false);
  });
});
