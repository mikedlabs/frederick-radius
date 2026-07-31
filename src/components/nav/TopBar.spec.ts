import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  pageOwnsPrimarySearch,
  shouldShowGlobalLocation,
  shouldShowGlobalMobileSearch,
  topBarFindTarget,
} from "./TopBar";

describe("TopBar search ownership", () => {
  it.each(["/map", "/search", "/compass", "/ask", "/ask/history"])(
    "lets the route's own search or composer lead on %s",
    (pathname) => {
      expect(pageOwnsPrimarySearch(pathname)).toBe(true);
      expect(shouldShowGlobalMobileSearch(pathname)).toBe(false);
    },
  );

  it("hands the map header action to the map search", () => {
    expect(topBarFindTarget("/map")).toBe("map");
    expect(topBarFindTarget("/today")).toBe("global");
    expect(topBarFindTarget("/compass")).toBe("global");
  });

  it("lets the Ask composer own its location scope", () => {
    expect(shouldShowGlobalLocation("/ask")).toBe(false);
    expect(shouldShowGlobalLocation("/ask/history")).toBe(false);
    expect(shouldShowGlobalLocation("/today")).toBe(true);
  });

  it.each(["/today", "/events", "/pulse", "/access", "/places/gravel-and-grind"])(
    "keeps global Find available on %s",
    (pathname) => {
      expect(pageOwnsPrimarySearch(pathname)).toBe(false);
      expect(shouldShowGlobalMobileSearch(pathname)).toBe(true);
    },
  );

  it("keeps the narrow mobile header to brand, location, and route-appropriate search", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");
    const location = readFileSync("src/components/nav/LocationChip.tsx", "utf8");

    expect(topBar).toContain('className="hidden text-[15px] min-[390px]:inline"');
    expect(location).toContain("min-[390px]:block sm:max-w-[160px]");
    expect(topBar).toContain('className="hidden sm:contents"');
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
