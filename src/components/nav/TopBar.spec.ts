import { readFileSync } from "node:fs";
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

  it("compacts labels below 390px without removing search or alert controls", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");
    const location = readFileSync("src/components/nav/LocationChip.tsx", "utf8");

    expect(topBar).toContain('className="hidden text-[15px] min-[390px]:inline"');
    expect(location).toContain("min-[390px]:block sm:max-w-[160px]");
    expect(topBar).toContain("<PulseIndicator />");
    expect(topBar).toContain("{showMobileSearch && (");
  });

  it("keeps the full search workspace out of the persistent shell until it opens", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");

    expect(topBar).toContain(
      'const SearchOverlay = lazy(() => import("@/components/search/SearchOverlay"))',
    );
    expect(topBar).not.toContain(
      'import SearchOverlay from "@/components/search/SearchOverlay"',
    );
    expect(topBar).toContain("{searchOpen ? (");
    expect(topBar).toContain("openerRef={searchOpenerRef}");
  });
});
