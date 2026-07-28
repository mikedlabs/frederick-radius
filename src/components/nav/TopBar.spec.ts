import { describe, expect, it } from "vitest";
import {
  pageOwnsPrimarySearch,
  shouldShowGlobalMobileSearch,
  topBarFindTarget,
} from "./TopBar";

describe("TopBar search ownership", () => {
  it.each(["/map", "/search", "/compass", "/ask", "/ask/history"])(
    "keeps a mobile search action available alongside local tools on %s",
    (pathname) => {
      expect(pageOwnsPrimarySearch(pathname)).toBe(true);
      expect(shouldShowGlobalMobileSearch(pathname)).toBe(true);
    },
  );

  it("hands the map header action to the map search", () => {
    expect(topBarFindTarget("/map")).toBe("map");
    expect(topBarFindTarget("/today")).toBe("global");
    expect(topBarFindTarget("/compass")).toBe("global");
  });

  it.each(["/today", "/events", "/pulse", "/places/gravel-and-grind"])(
    "keeps global Find available on %s",
    (pathname) => {
      expect(pageOwnsPrimarySearch(pathname)).toBe(false);
      expect(shouldShowGlobalMobileSearch(pathname)).toBe(true);
    },
  );
});
