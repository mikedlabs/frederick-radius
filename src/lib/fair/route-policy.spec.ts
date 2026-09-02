import { describe, expect, it } from "vitest";

import {
  FAIR_DAY_CANONICAL_PATH,
  FAIR_DAY_SHORT_PATH,
  isFairDayPath,
  shouldPostAutomaticActivity,
  shouldPrefetchGlobalNavigation,
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

  it("suppresses automatic hot-path work without hiding normal navigation", () => {
    for (const pathname of [FAIR_DAY_SHORT_PATH, FAIR_DAY_CANONICAL_PATH]) {
      expect(shouldPostAutomaticActivity(pathname)).toBe(false);
      expect(shouldPrefetchGlobalNavigation(pathname)).toBe(false);
    }
    expect(shouldPostAutomaticActivity("/today")).toBe(true);
    expect(shouldPrefetchGlobalNavigation("/today")).toBe(true);
  });
});
