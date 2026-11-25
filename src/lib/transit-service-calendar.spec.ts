import { describe, expect, it } from "vitest";
import {
  brunswickCancelled,
  countyRidePermitted,
  countyTransitException,
  requestedHolidayTransitDay,
  transitBulletinForDisplay,
} from "./transit-service-calendar";

describe("Frederick County's dated Thanksgiving 2026 service bulletin", () => {
  it.each([
    ["2026-11-25T23:59:59-05:00", true, true],
    ["2026-11-26T00:00:00-05:00", false, false],
    ["2026-11-27T23:59:59-05:00", false, false],
    ["2026-11-28T07:14:59-05:00", false, true],
    ["2026-11-28T07:15:00-05:00", true, true],
    ["2026-11-28T19:00:00-05:00", true, true],
    ["2026-11-28T19:00:01-05:00", false, true],
    ["2026-11-29T00:00:00-05:00", true, true],
    ["2027-11-26T12:00:00-05:00", true, true],
  ] as const)("applies each mode's Eastern boundary at %s", (iso, connector, shuttle) => {
    expect(countyRidePermitted(Date.parse(iso), false)).toBe(connector);
    expect(countyRidePermitted(Date.parse(iso), true)).toBe(shuttle);
  });

  it("previews the closure, removes expired rail copy, then clears the notice", () => {
    expect(countyTransitException("2026-11-24")).toBeNull();
    expect(transitBulletinForDisplay("2026-11-24")?.county).toHaveLength(2);
    expect(transitBulletinForDisplay("2026-11-28")).toMatchObject({ rail: null, county: [expect.stringContaining("Shuttles")] });
    expect(brunswickCancelled("2026-11-27")).toBe(true);
    expect(brunswickCancelled("2027-11-27")).toBe(false);
    expect(transitBulletinForDisplay("2026-11-29")).toBeNull();
  });

  it("uses the named holiday for a clock-only request without leaking into another year", () => {
    const now = new Date("2026-11-24T14:00:00Z");
    expect(requestedHolidayTransitDay("bus on Thanksgiving at 4pm", "2026-11-24", now)).toBe("2026-11-26");
    expect(requestedHolidayTransitDay("Saturday after Thanksgiving", null, now)).toBe("2026-11-28");
    expect(requestedHolidayTransitDay("day after Thanksgiving", null, now)).toBe("2026-11-27");
    expect(requestedHolidayTransitDay("bus on Thanksgiving 2027", null, new Date("2026-11-26T14:00:00Z"))).toBeNull();
  });
});
