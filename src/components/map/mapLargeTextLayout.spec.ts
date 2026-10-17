import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const appMap = readFileSync("src/components/map/AppMap.tsx", "utf8");
const bottomNav = readFileSync("src/components/nav/BottomNav.tsx", "utf8");

describe("map large-text layout contracts", () => {
  it("keeps the weather note's sentence and action on one rem body size", () => {
    expect(appMap).toContain("map-smart-note-reason");
    expect(appMap).toContain("map-smart-note-link");
    expect(appMap).toContain("map-smart-note-dismiss");
    expect(appMap).not.toContain("whitespace-nowrap rounded-full px-2 py-1 font-semibold");
    expect(css).toMatch(/\.map-smart-note \{[\s\S]*?font-size: max\(12px, 0\.75rem\)/);
    expect(css).toMatch(/\.map-smart-note-copy \{[\s\S]*?padding-right: 44px/);
    expect(css).toMatch(/\.map-smart-note-link \{[\s\S]*?font: inherit/);
    expect(css).toMatch(/\.map-smart-note-link \{[\s\S]*?text-decoration: underline/);
    expect(css).toMatch(/\.map-smart-note-dismiss \{[\s\S]*?width: 44px;[\s\S]*?height: 44px/);
  });

  it("caps the /map tab strip and publishes its real height for dock clearance", () => {
    expect(bottomNav).toContain('data-app-tabbar');
    expect(bottomNav).toContain("--app-tabbar-h");
    expect(bottomNav).toContain("h-[48px]");
    expect(css).toContain("--app-tabbar-h:");
    expect(css).toMatch(
      /html:has\(\[data-map-bottom-nav="true"\]\) \{[\s\S]*?--app-bottomnav-reserve: max\(68px, calc\(var\(--app-tabbar-h/,
    );
    expect(css).toMatch(
      /\.dock \{[\s\S]*?var\(--app-tabbar-h, var\(--app-bottomnav-reserve, 68px\)\)/,
    );
    expect(css).not.toMatch(
      /@media \(max-width: 1023\.98px\) \{[\s\S]*?\[data-map-bottom-nav="true"\][\s\S]*?\.dock \{[\s\S]*?bottom: 7px;/,
    );
  });
});
