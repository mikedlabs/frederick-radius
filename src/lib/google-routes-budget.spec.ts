import { describe, expect, it } from "vitest";
import { googleRoutesDailyElementCap } from "./google-routes-budget";

describe("Google Routes daily element budget", () => {
  it.each([undefined, "", "nope", "1.5", "9007199254740999"])(
    "uses the measured-traffic default for invalid input (%s)",
    (raw) => {
      expect(googleRoutesDailyElementCap(raw)).toBe(100);
    },
  );

  it("allows a lower operator ceiling", () => {
    expect(googleRoutesDailyElementCap("1")).toBe(1);
    expect(googleRoutesDailyElementCap("80")).toBe(80);
    expect(googleRoutesDailyElementCap("0")).toBe(1);
  });

  it("cannot exceed the immutable monthly-safe maximum", () => {
    expect(googleRoutesDailyElementCap("160")).toBe(160);
    expect(googleRoutesDailyElementCap("161")).toBe(160);
    expect(googleRoutesDailyElementCap("999999")).toBe(160);
  });
});
