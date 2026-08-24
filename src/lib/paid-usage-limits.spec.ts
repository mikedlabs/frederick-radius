import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT,
  googleEventGeocodeDailyLimit,
  MAX_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT,
} from "./paid-usage-limits";

afterEach(() => {
  delete process.env.GOOGLE_EVENT_GEOCODE_DAILY_LIMIT;
});

describe("google event geocode daily limit", () => {
  it("uses a deliberately small bounded default", () => {
    expect(googleEventGeocodeDailyLimit()).toBe(
      DEFAULT_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT,
    );
    expect(DEFAULT_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT).toBeLessThan(
      MAX_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT,
    );
  });

  it("supports an explicit zero-cost kill switch", () => {
    expect(googleEventGeocodeDailyLimit("0")).toBe(0);
  });

  it("clamps operator input to the code-owned maximum", () => {
    expect(googleEventGeocodeDailyLimit("999999")).toBe(
      MAX_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT,
    );
  });

  it.each(["nope", "1.5", "-1", Number.NaN, -2])(
    "falls back safely for malformed input %s",
    (value) => {
      expect(googleEventGeocodeDailyLimit(value)).toBe(
        DEFAULT_GOOGLE_EVENT_GEOCODE_DAILY_LIMIT,
      );
    },
  );
});
