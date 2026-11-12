import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  pageOwnsPrimarySearch,
  shouldShowGlobalLocation,
  shouldShowGlobalMobileSearch,
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
    expect(location).toContain("text-[13px] font-semibold leading-none");
    expect(styles).toContain('[data-location-scope-label="compact"]');
    expect(styles).toContain('[data-location-scope-label="full"]');
    expect(topBar).toContain('className="contents"');
    expect(topBar).toContain("{showMobileSearch && (");
  });

  it("keeps the header flat: unboxed tools, borders only on fields, no capsules", () => {
    const source = ["TopBar.tsx", "LocationChip.tsx"]
      .map((file) => readFileSync(`src/components/nav/${file}`, "utf8"))
      .join("\n");
    // Back, desktop search field, phone search, Tools, the loading Close, and
    // the location chip. Every one keeps a 44px row (h-11) or the desktop
    // field's tap-44 extender, and a utility corner rather than a capsule.
    const controls = source.split("\n").filter((line) => /className=.*\sh-(9|11)\s/.test(line));
    expect(controls).toHaveLength(6);
    for (const control of controls) {
      expect(control).toMatch(/rounded-\[var\(--app-radius-(sm|md)\)\]/);
      expect(control).not.toContain("rounded-full");
      expect(control).toMatch(/\sh-11\s|\stap-44\s/);
    }
    // Plain tool chrome: only two controls carry a border, the desktop search
    // field (a 6px field) and the Close button in the search loading
    // fallback. Icon tools are ink glyphs on the bar's own ground.
    const bordered = controls.filter((line) => /\sborder[\s"]/.test(line));
    expect(bordered).toHaveLength(2);
    const desktopField = bordered.find((line) => line.includes("styles.search"));
    expect(desktopField).toContain("rounded-[var(--app-radius-md)]");
    const loadingClose = bordered.find((line) => !line.includes("styles.search"));
    expect(loadingClose).toContain("grid h-11 w-11 place-items-center rounded-[var(--app-radius-sm)] border");
    const topBarSource = readFileSync("src/components/nav/TopBar.tsx", "utf8");
    expect(topBarSource).toMatch(/grid h-11 w-11 place-items-center rounded-\[var\(--app-radius-sm\)\] border"[\s\S]{0,200}aria-label="Close search"/);
    for (const tool of controls.filter((line) => line.includes("styles.tool"))) {
      expect(tool).not.toMatch(/\sborder[\s"]/);
    }
  });

  it("starts the desktop lockup on the reading column's left edge", () => {
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");
    const chrome = readFileSync("src/components/nav/NavChrome.module.css", "utf8").replace(/\s+/g, " ");
    const main = readFileSync("src/app/globals.css", "utf8").replace(/\s+/g, " ");

    // A Tailwind padding utility on the row loses to `.bar .row` and did
    // nothing for months; the rule lives beside the padding it overrides.
    expect(topBar).not.toMatch(/data-app-topbar-row[\s\S]{0,200}\blg:pl-/);
    expect(main).toContain("@media (min-width: 1024px) { .app-main-reading { padding-left: 6rem; padding-right: 1.25rem; } }");
    expect(chrome).toContain(
      "@media (min-width: 1024px) { .bar .row { padding-left: min(6rem, 96px); padding-right: max(1.25rem, env(safe-area-inset-right, 0px)); } }",
    );
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
