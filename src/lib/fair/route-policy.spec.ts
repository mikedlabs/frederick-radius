import { describe, expect, it } from "vitest";

import {
  FAIR_DAY_CANONICAL_PATH,
  FAIR_DAY_SHORT_PATH,
  isFairDayPath,
  shouldPostAutomaticActivity,
  shouldPrefetchGlobalNavigation,
  shouldShowGlobalAppChrome,
} from "./route-policy";

describe("Fair Day route policy", () => {
  it("recognizes only the short and canonical Fair entrances", () => {
    expect(isFairDayPath(FAIR_DAY_SHORT_PATH)).toBe(true);
    expect(isFairDayPath(`${FAIR_DAY_SHORT_PATH}/`)).toBe(true);
    expect(isFairDayPath(FAIR_DAY_CANONICAL_PATH)).toBe(true);
    expect(isFairDayPath(`${FAIR_DAY_CANONICAL_PATH}/`)).toBe(true);
    expect(isFairDayPath("/moments/in-the-street-2026")).toBe(false);
    expect(isFairDayPath("/fairgrounds")).toBe(false);
  });

  it("gives both Fair entrances a dedicated shell", () => {
    for (const pathname of [FAIR_DAY_SHORT_PATH, FAIR_DAY_CANONICAL_PATH]) {
      expect(shouldShowGlobalAppChrome(pathname)).toBe(false);
    }
    expect(shouldShowGlobalAppChrome("/today")).toBe(true);
    expect(shouldShowGlobalAppChrome("/moments/in-the-street-2026")).toBe(true);
  });

  it("suppresses automatic hot-path work", () => {
    for (const pathname of [FAIR_DAY_SHORT_PATH, FAIR_DAY_CANONICAL_PATH]) {
      expect(shouldPostAutomaticActivity(pathname)).toBe(false);
      expect(shouldPrefetchGlobalNavigation(pathname)).toBe(false);
    }
    expect(shouldPostAutomaticActivity("/today")).toBe(true);
    expect(shouldPrefetchGlobalNavigation("/today")).toBe(true);
  });
  it.each([
    "/events/evening-concert", "/events/evening-concert/",
    "/places/brewers-alley-frederick", "/places/brewers-alley-frederick/",
  ])("keeps %s chrome and activity available while deferring automatic tab loads", (pathname) => {
    expect(shouldPrefetchGlobalNavigation(pathname)).toBe(false);
    expect(shouldShowGlobalAppChrome(pathname)).toBe(true);
    expect(shouldPostAutomaticActivity(pathname)).toBe(true);
  });

  it.each([
    "/events", "/events/", "/events/calendar", "/events/calendar/",
    "/places", "/places/", "/today", "/my-radius",
    "/events/example/related", "/places/example/photos", "/moments/in-the-street-2026",
  ])("preserves automatic tab loading for the existing non-detail route %s", (pathname) => {
    expect(shouldPrefetchGlobalNavigation(pathname)).toBe(true);
  });

});
