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

  it("keeps the narrow mobile header to brand, visible location, and route-appropriate search", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");
    const location = readFileSync("src/components/nav/LocationChip.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(topBar).toContain('className="hidden text-[15px] min-[390px]:inline"');
    expect(location).toContain('data-location-scope-label="compact"');
    expect(location).toContain('data-location-scope-label="full"');
    expect(location).toContain(': "County";');
    expect(styles).toContain('[data-location-scope-label="compact"]');
    expect(styles).toContain('[data-location-scope-label="full"]');
    expect(topBar).toContain('className="contents"');
    expect(topBar).toContain("{showMobileSearch && (");
  });

  it("keeps the mobile scope picker bounded with an explicit close action", () => {
    const location = readFileSync("src/components/nav/LocationChip.tsx", "utf8");

    expect(location).toContain("data-location-scope-menu");
    expect(location).toContain("max-h-[min(62dvh,31rem)]");
    expect(location).toContain('aria-label="Done choosing an area"');
    expect(location).toContain("min-h-0 overflow-y-auto overscroll-contain");
  });

  it("keeps the town inventory behind one deliberate choice", () => {
    const location = readFileSync("src/components/nav/LocationChip.tsx", "utf8");

    expect(location).toContain("const [showTowns, setShowTowns] = useState(false)");
    expect(location).toContain("Choose a town");
    expect(location).toContain("Back to area choices");
    expect(location.match(/data-town-disclosure/g)).toHaveLength(1);
    expect(location).toContain("setShowTowns((visible) => !visible)");
    expect(location).toContain("aria-expanded={showTowns}");
    expect(location).toContain('aria-controls="location-town-choices"');
    expect(location).toContain('id="location-town-choices" hidden={!showTowns}');
    expect(location.indexOf("data-town-disclosure")).toBeLessThan(
      location.indexOf('id="location-town-choices"'),
    );
  });

  it("keeps Compass branded while clarifying the tool destination on mobile", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");
    const pulse = readFileSync("src/components/nav/PulseIndicator.tsx", "utf8");

    expect(topBar).toContain('aria-label="Open Compass tools"');
    expect(topBar).toContain(">Compass</span>");
    expect(topBar).toContain(">Tools</span>");
    expect(topBar).not.toContain('pathname !== "/compass"');
    expect(pulse).toContain("Pulse: checking county status");
    expect(pulse).toMatch(/>\s*Pulse\s*</);
    expect(pulse).not.toContain("return null");
  });

  it("presents beta as product status inside the home lockup, not another tool", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");

    expect(topBar).toContain('"Frederick Radius beta, home"');
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
