import { describe, it, expect } from "vitest";
import { isStaleRender, renderedDayLabel } from "./freshness";

describe("isStaleRender", () => {
  it("is fresh when rendered the same Eastern day", () => {
    const now = new Date("2026-06-09T20:00:00-04:00");
    expect(isStaleRender("2026-06-09T07:00:00-04:00", now)).toBe(false);
  });

  it("is stale when rendered on an earlier Eastern day (the June-9 review case)", () => {
    const now = new Date("2026-06-09T12:00:00-04:00");
    expect(isStaleRender("2026-06-07T20:51:00-04:00", now)).toBe(true);
  });

  it("uses the EASTERN day boundary, not UTC", () => {
    // 11 PM June 8 Eastern is 03:00 June 9 UTC — same Eastern day as
    // 11:30 PM June 8 Eastern, so NOT stale despite different UTC days.
    const now = new Date("2026-06-08T23:30:00-04:00");
    expect(isStaleRender("2026-06-08T23:00:00-04:00", now)).toBe(false);
    // …and one Eastern minute past midnight IS a new day.
    const after = new Date("2026-06-09T00:01:00-04:00");
    expect(isStaleRender("2026-06-08T23:59:00-04:00", after)).toBe(true);
  });

  it("fails open on malformed timestamps (never a false alarm)", () => {
    expect(isStaleRender("not-a-date")).toBe(false);
    expect(isStaleRender("")).toBe(false);
  });
});

describe("renderedDayLabel", () => {
  it("formats the Eastern render day", () => {
    expect(renderedDayLabel("2026-06-07T20:51:00-04:00")).toBe("Sunday, June 7");
  });
});
