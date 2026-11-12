import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { TABS, shouldPrefetchGlobalNavigation, tabIndexForPath } from "./tabs";

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

  it("leaves the retired Fair address outside every primary tab", () => {
    expect(tabIndexForPath("/fair")).toBe(-1);
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

describe("primary tab prefetch policy", () => {
  it.each([
    "/events/evening-concert", "/events/evening-concert/",
    "/places/brewers-alley-frederick", "/places/brewers-alley-frederick/",
  ])("defers automatic tab loads on the canonical detail page %s", (pathname) => {
    expect(shouldPrefetchGlobalNavigation(pathname)).toBe(false);
  });

  it.each([
    "/events", "/events/", "/events/calendar", "/events/calendar/",
    "/places", "/places/", "/today", "/my-radius", "/fair",
    "/events/example/related", "/places/example/photos", "/moments/in-the-street-2026",
  ])("preserves automatic tab loading on the non-detail route %s", (pathname) => {
    expect(shouldPrefetchGlobalNavigation(pathname)).toBe(true);
  });
});
