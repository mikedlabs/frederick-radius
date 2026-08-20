import { describe, it, expect } from "vitest";
import { daypartBrowseHref, daypartNeeds } from "./daypart-needs";

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
  it("sends every 'see all' to the availability-ordered Nearby journey", () => {
    // The server HTML renders these hrefs under a "Places open now" heading,
    // so they must never point at a popularity-sorted /category page.
    expect(daypartNeeds(8).map((n) => n.href)).toEqual([
      "/nearby?c=coffee",
      "/nearby?c=breakfast",
    ]);
    expect(daypartNeeds(13).map((n) => n.href)).toEqual([
      "/nearby?c=lunch",
      "/nearby?c=coffee",
    ]);
    expect(daypartNeeds(23).map((n) => n.href)).toEqual([
      "/nearby?c=drinks&facet=bar",
      "/nearby?c=late",
    ]);
    expect(daypartNeeds(14, "wet").map((n) => n.href)).toEqual([
      "/nearby?c=art&facet=museum",
      "/nearby?c=shops&facet=book-store",
      "/nearby?c=lunch",
      "/nearby?c=coffee",
    ]);
    expect(daypartNeeds(14, "hot")[0].href).toBe("/nearby?c=ice-cream");
  });
  it("keeps the evening brewery row on the /beer product surface", () => {
    const evening = daypartNeeds(18);
    expect(evening.find((n) => n.category === "brewery")?.href).toBe("/beer");
    expect(evening.find((n) => n.category === "restaurant")?.href).toBe(
      "/nearby?c=dinner",
    );
    expect(evening.find((n) => n.category === "bar")?.href).toBe(
      "/nearby?c=drinks&facet=bar",
    );
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

describe("daypartBrowseHref", () => {
  it("carries the coarse browsing scope in the URL", () => {
    expect(daypartBrowseHref("coffee", "Coffee", "nearme")).toBe(
      "/nearby?c=coffee&in=nearme",
    );
    expect(daypartBrowseHref("restaurant", "Dinner", "town:brunswick")).toBe(
      "/nearby?c=dinner&in=brunswick",
    );
    expect(daypartBrowseHref("bar", "Bars open late", "county")).toBe(
      "/nearby?c=drinks&facet=bar&in=county",
    );
    expect(daypartBrowseHref("museum", "Museums & indoors")).toBe(
      "/nearby?c=art&facet=museum",
    );
  });
  it("keeps breweries on /beer even when a scope is active", () => {
    expect(daypartBrowseHref("brewery", "Breweries & taprooms")).toBe("/beer");
    expect(
      daypartBrowseHref("brewery", "Breweries & taprooms", "town:brunswick"),
    ).toBe("/beer");
  });
  it("returns null for a category without a Nearby mapping", () => {
    expect(daypartBrowseHref("hardware-store", "Hardware")).toBeNull();
  });
});
