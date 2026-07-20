import { describe, it, expect } from "vitest";
import { daypartNeeds } from "./daypart-needs";

describe("daypartNeeds", () => {
  it("leads with coffee + breakfast in the morning", () => {
    expect(daypartNeeds(8).map((n) => n.category)).toEqual(["coffee", "bakery"]);
  });
  it("leads with lunch at midday", () => {
    expect(daypartNeeds(13)[0]).toMatchObject({ label: "Lunch", category: "restaurant" });
  });
  it("leads with dinner and drinks in the evening (from 17:00)", () => {
    const cats = daypartNeeds(18).map((n) => n.category);
    expect(cats[0]).toBe("restaurant");
    expect(cats).toContain("brewery");
    expect(cats).toContain("bar");
  });
  it("shows who's still serving late", () => {
    expect(daypartNeeds(23).map((n) => n.category)).toEqual(["bar", "restaurant"]);
    expect(daypartNeeds(2).map((n) => n.category)).toEqual(["bar", "restaurant"]);
  });
  it("every need has a real category and href, and wraps out-of-range hours", () => {
    for (const h of [6, 12, 19, 22]) {
      for (const n of daypartNeeds(h)) {
        expect(n.category).toMatch(/^[a-z-]+$/);
        expect(n.href.startsWith("/")).toBe(true);
      }
    }
    expect(daypartNeeds(24)).toEqual(daypartNeeds(0));
  });
});
