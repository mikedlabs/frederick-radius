import { describe, expect, it } from "vitest";
import {
  pageOwnsPrimarySearch,
  shouldShowGlobalMobileSearch,
} from "./TopBar";

describe("TopBar search ownership", () => {
  it.each(["/map", "/search", "/compass", "/ask", "/ask/history"])(
    "does not duplicate the local search on %s",
    (pathname) => {
      expect(pageOwnsPrimarySearch(pathname)).toBe(true);
      expect(shouldShowGlobalMobileSearch(pathname)).toBe(false);
    },
  );

  it.each(["/today", "/events", "/pulse", "/places/gravel-and-grind"])(
    "keeps global Find available on %s",
    (pathname) => {
      expect(pageOwnsPrimarySearch(pathname)).toBe(false);
      expect(shouldShowGlobalMobileSearch(pathname)).toBe(true);
    },
  );
});
