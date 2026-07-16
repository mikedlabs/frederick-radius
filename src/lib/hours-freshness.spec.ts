import { describe, expect, it } from "vitest";
import {
  HOURS_MAX_AGE_DAYS,
  hoursFreshnessEnforced,
  isHoursFresh,
  mayAssertOpenState,
} from "@/lib/hours-freshness";

const NOW = new Date("2026-07-15T16:00:00.000Z");

describe("hours freshness truth boundary", () => {
  it("stays staged until the refresh snapshot is ready", () => {
    const previous = process.env.HOURS_FRESHNESS_ENFORCED;
    process.env.HOURS_FRESHNESS_ENFORCED = "0";
    try {
      expect(hoursFreshnessEnforced()).toBe(false);
      expect(mayAssertOpenState(true, "2026-06-01T00:00:00.000Z", NOW)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.HOURS_FRESHNESS_ENFORCED;
      else process.env.HOURS_FRESHNESS_ENFORCED = previous;
    }
  });

  it("requires both a verified row and an in-window timestamp", () => {
    const previous = process.env.HOURS_FRESHNESS_ENFORCED;
    process.env.HOURS_FRESHNESS_ENFORCED = "1";
    try {
      expect(mayAssertOpenState(false, "2026-07-15T12:00:00.000Z", NOW)).toBe(false);
      expect(mayAssertOpenState(true, undefined, NOW)).toBe(false);
      expect(mayAssertOpenState(true, "2026-07-10T12:00:00.000Z", NOW)).toBe(true);
      expect(
        mayAssertOpenState(
          true,
          new Date(NOW.getTime() - (HOURS_MAX_AGE_DAYS + 1) * 86_400_000).toISOString(),
          NOW,
        ),
      ).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.HOURS_FRESHNESS_ENFORCED;
      else process.env.HOURS_FRESHNESS_ENFORCED = previous;
    }
  });

  it("rejects corrupt future dates while allowing minor clock skew", () => {
    expect(isHoursFresh("2026-07-15T16:04:00.000Z", NOW)).toBe(true);
    expect(isHoursFresh("2026-07-16T16:00:00.000Z", NOW)).toBe(false);
  });
});
