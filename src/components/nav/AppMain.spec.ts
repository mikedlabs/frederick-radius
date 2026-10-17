import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  FAIR_DAY_CANONICAL_PATH,
  FAIR_DAY_SHORT_PATH,
} from "@/lib/fair/route-policy";
import { appMainModeForPath } from "./AppMain";

describe("AppMain route mode", () => {
  it("gives both Fair entrances the dedicated unpadded canvas", () => {
    expect(appMainModeForPath(FAIR_DAY_SHORT_PATH)).toBe("dedicated-fair");
    expect(appMainModeForPath(FAIR_DAY_CANONICAL_PATH)).toBe("dedicated-fair");
  });

  it("preserves the map and reading layouts everywhere else", () => {
    expect(appMainModeForPath("/map")).toBe("full-bleed");
    expect(appMainModeForPath("/today")).toBe("reading");
    expect(appMainModeForPath("/moments/in-the-street-2026")).toBe("reading");
  });
});

describe("AppMain reading reserve", () => {
  it("clears the tab bar with --app-tabbar-h plus the safe area, not a rem slab", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");
    expect(globals).toMatch(/--app-tabbar-h:\s*68px/);
    expect(globals).toContain(
      "padding-bottom: calc(var(--app-tabbar-h) + env(safe-area-inset-bottom, 0px))",
    );
    expect(globals).not.toContain("padding-bottom: calc(6rem + env(safe-area-inset-bottom, 0px))");
  });
});
