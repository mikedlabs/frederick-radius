import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { TABS, backFallbackForPath, isDetailPath, tabIndexForPath } from "./tabs";

describe("Ask Radius navigation context", () => {
  it("treats Ask as a focused workspace without adding another primary tab", () => {
    expect(tabIndexForPath("/ask")).toBe(-1);
    expect(tabIndexForPath("/ask/history")).toBe(-1);
    expect(TABS).toHaveLength(4);
    expect(TABS.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/today", label: "Today" },
      { href: "/map", label: "Map" },
      { href: "/events", label: "Events" },
      { href: "/my-radius", label: "Saved" },
    ]);
  });

  it("does not prefetch the county map's large server payload", () => {
    expect(TABS).toHaveLength(4);
    expect(TABS.map(({ href, prefetch }) => ({ href, prefetch }))).toEqual([
      { href: "/today", prefetch: "auto" },
      { href: "/map", prefetch: false },
      { href: "/events", prefetch: "auto" },
      { href: "/my-radius", prefetch: "auto" },
    ]);
  });

  it("makes Ask discoverable from an installed app", () => {
    expect(manifest().shortcuts).toContainEqual({
      name: "Ask Radius",
      short_name: "Ask",
      url: "/ask",
    });
  });

  it("keeps mapped utilities and live music in the expected primary section", () => {
    expect(tabIndexForPath("/trails")).toBe(1);
    expect(tabIndexForPath("/rivers")).toBe(1);
    expect(tabIndexForPath("/parking")).toBe(1);
    expect(tabIndexForPath("/transit")).toBe(1);
    expect(tabIndexForPath("/live-music")).toBe(2);
  });

  it("keeps both Fair Day entrances owned by Today without adding a tab", () => {
    expect(tabIndexForPath("/fair")).toBe(0);
    expect(tabIndexForPath("/moments/great-frederick-fair-2026")).toBe(0);
    expect(TABS).toHaveLength(4);
  });

  it("keeps registered secondary tools inside their parent journey", () => {
    expect(tabIndexForPath("/beer")).toBe(0);
    expect(tabIndexForPath("/pulse")).toBe(0);
    expect(tabIndexForPath("/access")).toBe(0);
    expect(tabIndexForPath("/parks")).toBe(1);
    expect(tabIndexForPath("/amenities")).toBe(1);
    expect(tabIndexForPath("/sports")).toBe(2);
    expect(tabIndexForPath("/settings")).toBe(3);
    expect(tabIndexForPath("/search")).toBe(-1);
  });
});

describe("detail pages", () => {
  it.each([
    "/places/gravel-and-grind",
    "/events/fall-festival-2026",
    "/m/thurmont",
    "/m/thurmont/anything-below",
  ])("marks %s as a detail that owes the reader a header Back", (pathname) => {
    expect(isDetailPath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/places",
    "/places/",
    "/events",
    "/events/calendar",
    "/m",
    "/map",
    "/today",
    "/my-radius",
    "/category/coffee",
    "/collections/patios",
    "/placeskeeper",
  ])("does not mark %s as a detail", (pathname) => {
    expect(isDetailPath(pathname)).toBe(false);
  });

  it("keeps bottom-nav highlighting unchanged for detail pages", () => {
    expect(tabIndexForPath("/places/gravel-and-grind")).toBe(1);
    expect(tabIndexForPath("/m/thurmont")).toBe(1);
    expect(tabIndexForPath("/events/fall-festival-2026")).toBe(2);
    expect(tabIndexForPath("/events/calendar")).toBe(2);
    expect(tabIndexForPath("/places")).toBe(1);
    expect(tabIndexForPath("/about")).toBe(-1);
  });

  it("sends a cold Back to the page's own section, or Today when no tab claims it", () => {
    expect(backFallbackForPath("/events/fall-festival-2026")).toBe("/events");
    expect(backFallbackForPath("/places/gravel-and-grind")).toBe("/map");
    expect(backFallbackForPath("/m/thurmont")).toBe("/map");
    expect(backFallbackForPath("/about")).toBe("/today");
    expect(backFallbackForPath("/ask")).toBe("/today");
  });
});
