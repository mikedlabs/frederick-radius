import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  pageOwnsPrimarySearch,
  shouldShowGlobalLocation,
  shouldShowGlobalMobileSearch,
  showsHeaderBack,
  showsPhoneWordmark,
  topBarFindTarget,
} from "./TopBar";

describe("TopBar search ownership", () => {
  it.each(["/today", "/map", "/search", "/compass", "/ask", "/ask/history"])(
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
    expect(shouldShowGlobalLocation("/today")).toBe(false);
    expect(shouldShowGlobalLocation("/search")).toBe(false);
  });

  it.each(["/events", "/pulse", "/access", "/places/gravel-and-grind"])(
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
    expect(location).toContain(
      'className="hidden min-w-0 truncate min-[390px]:block sm:hidden"',
    );
    expect(location).toContain(
      'className="hidden min-w-0 truncate sm:block sm:max-w-[160px]"',
    );
    expect(location).toContain("text-[12px] font-semibold leading-none");
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

  it("uses literal County status and Tools labels in the shared chrome", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");
    const pulse = readFileSync("src/components/nav/PulseIndicator.tsx", "utf8");

    expect(topBar).toContain('aria-label="Open tools"');
    expect(topBar).not.toContain(">Compass</span>");
    expect(topBar).toContain(">Tools</span>");
    expect(topBar).not.toContain('pathname !== "/compass"');
    expect(pulse).toContain("County status: checking");
    expect(pulse).toMatch(/>\s*County status\s*</);
    expect(pulse).not.toContain("return null");
  });

  it("presents beta as product status inside the home lockup, not another tool", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");

    expect(topBar).toContain('"Frederick Radius beta, home"');
    expect(topBar).toContain('data-product-status="beta"');
    expect(topBar).toMatch(/data-product-status="beta"[\s\S]*>\s*Beta\s*<\/span>/);
    expect(topBar).toContain('"hidden whitespace-nowrap leading-none sm:block"');
    expect(topBar).not.toContain('href="/beta"');
  });

  it.each(["/today", "/compass", "/search", "/ask"])(
    "shows the full Caslon wordmark from 375px on %s, which owns its search and scope",
    (pathname) => {
      expect(showsPhoneWordmark(pathname)).toBe(true);
    },
  );

  it.each(["/map", "/events", "/places/gravel-and-grind", "/pulse"])(
    "keeps the bare mark on phones on %s",
    (pathname) => {
      expect(showsPhoneWordmark(pathname)).toBe(false);
    },
  );

  it("sets that wordmark at 18px beside the 30px Ripple", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");

    expect(topBar).toContain('"hidden whitespace-nowrap leading-none min-[375px]:block"');
    expect(topBar).toContain("font-brand text-[18px]");
    expect(topBar).toContain('size={pathname === "/map" || phoneWordmark ? 30 : 34}');
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

describe("TopBar control family", () => {
  const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");
  const header = topBar.slice(topBar.indexOf("<header"), topBar.indexOf("</header>"));

  it("draws the header opaque, with no frosted blur", () => {
    const chrome = readFileSync("src/components/nav/NavChrome.module.css", "utf8");
    const start = chrome.indexOf(".bar {");
    const bar = chrome.slice(start, chrome.indexOf("}", start));

    expect(header).toContain("data-app-topbar");
    expect(header).not.toContain("backdrop-blur");
    expect(bar).toContain("background: var(--app-bg-elevated-solid);");
    expect(bar).not.toMatch(/background:[^;]*transparent/);
  });

  it("keeps every header control 44px tall with a utility corner; only the scope chip is a capsule", () => {
    // Back, mobile search, desktop search and Tools. County status lives in
    // PulseIndicator and the capsule scope chip in LocationChip.
    expect(header).not.toContain("rounded-full");
    expect(header).not.toMatch(/\bh-9\b/);
    expect(header).toContain('aria-label="Back"');
    expect(header.match(/rounded-\[var\(--app-radius-(?:sm|md)\)\] border/g)?.length).toBeGreaterThanOrEqual(4);
    const pulse = readFileSync("src/components/nav/PulseIndicator.tsx", "utf8");
    expect(pulse).toContain("h-11 min-w-11");
    expect(pulse).toContain("rounded-[var(--app-radius-sm)] border");
  });

  it("does not let the map strip borders from the header controls", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const mapHeaderRules = css
      .split("}")
      .filter((rule) => rule.includes('header[data-map-header="true"]'))
      .join("}");

    expect(mapHeaderRules).not.toMatch(/border:\s*0/);
    expect(mapHeaderRules).not.toMatch(/border-color:\s*transparent/);
    expect(mapHeaderRules).not.toMatch(/background:\s*transparent/);
    expect(mapHeaderRules).not.toContain("backdrop-filter");
  });
});

describe("Persistent chrome during route transitions", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const ruleFor = (selector: string) => {
    const start = css.indexOf(`${selector},`) >= 0 ? css.indexOf(`${selector},`) : css.indexOf(`${selector} {`);
    return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
  };

  it.each([
    ["[data-app-topbar]", "app-header"],
    ["[data-bottom-nav-shell]", "app-nav"],
    ["[data-app-action-bar]", "app-action-bar"],
  ])("gives %s its own snapshot so page text never paints over it", (selector, name) => {
    expect(css).toContain(`${selector} {\n  view-transition-name: ${name};\n}`);
    expect(ruleFor(`::view-transition-group(${name})`)).toMatch(/z-index: 1;[\s\S]*animation: none;/);
    expect(ruleFor(`::view-transition-old(${name})`)).toContain("opacity: 0;");
    expect(ruleFor(`::view-transition-new(${name})`)).toContain("animation: none;");
  });

  it("names the elements those rules target", () => {
    expect(readFileSync("src/components/nav/TopBar.tsx", "utf8")).toContain("data-app-topbar");
    expect(readFileSync("src/components/nav/BottomNav.tsx", "utf8")).toContain("data-bottom-nav-shell");
    expect(readFileSync("src/components/ui/MobileActionBar.tsx", "utf8")).toContain("data-app-action-bar");
  });
});

describe("TopBar Back placement", () => {
  it.each([
    "/places/gravel-and-grind",
    "/events/fall-festival-2026",
    "/m/thurmont",
  ])("shows Back on the %s detail even though its section tab stays lit", (pathname) => {
    expect(showsHeaderBack(pathname)).toBe(true);
  });

  it.each(["/about", "/ask", "/search"])(
    "keeps Back on %s, which no tab claims",
    (pathname) => {
      expect(showsHeaderBack(pathname)).toBe(true);
    },
  );

  it.each(["/", "/today", "/map", "/events", "/events/calendar", "/my-radius", "/places", "/trails"])(
    "keeps the home wordmark on the tab root or section page %s",
    (pathname) => {
      expect(showsHeaderBack(pathname)).toBe(false);
    },
  );
});
