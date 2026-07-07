import { describe, it, expect } from "vitest";
import { easternHourFloat, withinScrubWindow } from "./scrubTime";

describe("easternHourFloat", () => {
  it("converts hour+minute to a 0-24 float", () => {
    expect(easternHourFloat({ hour: 18, minute: 30 })).toBe(18.5);
    expect(easternHourFloat({ hour: 0, minute: 0 })).toBe(0);
  });
});

describe("withinScrubWindow", () => {
  it("shows an event during its run", () => {
    expect(withinScrubWindow(18, 22, 19)).toBe(true);
    expect(withinScrubWindow(18, 22, 18)).toBe(true);
  });
  it("shows it in the lead-in window before start", () => {
    expect(withinScrubWindow(18, 22, 17)).toBe(true); // 1h before, within 1.5h lead
    expect(withinScrubWindow(18, 22, 16)).toBe(false); // 2h before, outside lead
  });
  it("hides it once ended", () => {
    expect(withinScrubWindow(18, 22, 22)).toBe(false);
    expect(withinScrubWindow(18, 22, 23)).toBe(false);
  });
  it("treats a missing or past-midnight end as running to end-of-day", () => {
    expect(withinScrubWindow(21, 21, 23)).toBe(true); // no real end → to 24
    expect(withinScrubWindow(22, 1, 23.5)).toBe(true); // spans midnight → to 24
  });
  it("respects a custom lead", () => {
    expect(withinScrubWindow(18, 22, 17, 0.5)).toBe(false);
    expect(withinScrubWindow(18, 22, 17.75, 0.5)).toBe(true);
  });
});
