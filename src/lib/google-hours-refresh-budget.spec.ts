import { describe, expect, it } from "vitest";
import { googleHoursRefreshDailyCap } from "./google-hours-refresh-budget";

describe("Google hours-refresh daily budget", () => {
  it.each([undefined, "", "not-a-number", "1.5", "9007199254740999"])(
    "uses the measured-bucket default for invalid input (%s)",
    (raw) => {
      expect(googleHoursRefreshDailyCap(raw)).toBe(300);
    },
  );

  it("allows an operator to lower the ceiling without disabling the guard", () => {
    expect(googleHoursRefreshDailyCap("1")).toBe(1);
    expect(googleHoursRefreshDailyCap("250")).toBe(250);
    expect(googleHoursRefreshDailyCap("0")).toBe(1);
  });

  it("never exceeds the route's immutable 400-target batch cap", () => {
    expect(googleHoursRefreshDailyCap("400")).toBe(400);
    expect(googleHoursRefreshDailyCap("401")).toBe(400);
    expect(googleHoursRefreshDailyCap("999999")).toBe(400);
  });
});
