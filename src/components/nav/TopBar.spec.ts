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

  it("keeps Pulse and Compass as stable named destinations instead of a Tools button", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");
    const pulse = readFileSync("src/components/nav/PulseIndicator.tsx", "utf8");

    expect(topBar).toContain('aria-label="Open Compass"');
    expect(topBar).toContain(">Compass</span>");
    expect(topBar).not.toContain(">Tools</span>");
    expect(topBar).not.toContain('pathname !== "/compass"');
    expect(pulse).toContain("Pulse: checking county status");
    expect(pulse).toMatch(/>\s*Pulse\s*</);
    expect(pulse).not.toContain("return null");
  });

  it("presents beta as product status inside the home lockup, not another tool", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");

    expect(topBar).toContain('aria-label="Frederick Radius beta, home"');
    expect(topBar).toContain('data-product-status="beta"');
    expect(topBar).toMatch(/data-product-status="beta"[\s\S]*>\s*Beta\s*<\/span>/);
    expect(topBar).toContain(
      'className="hidden whitespace-nowrap leading-none sm:block"',
    );
    expect(topBar).not.toContain('href="/beta"');
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
