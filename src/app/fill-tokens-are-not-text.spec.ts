import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

function stylesheets(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

// Fills, per the palette contract in src/lib/brand.ts and the agent guide.
// Deep Coral is 5.0:1 on white but 3.4:1 on the dark canvas, and its link
// counterpart is redefined for dark appearance while the fill is not.
const FILL_ONLY = /^var\(--app-(?:brand|brand-press|cool)\s*[,)]/;

describe("coral and Creek fill tokens", () => {
  const files = stylesheets("src");

  it("are never the text color in a stylesheet", () => {
    expect(files.length).toBeGreaterThan(20);
    const offenders: string[] = [];
    for (const file of files) {
      postcss.parse(readFileSync(file, "utf8")).walkDecls("color", (entry) => {
        if (FILL_ONLY.test(entry.value.trim())) offenders.push(`${file}: ${(entry.parent as postcss.Rule).selector} { color: ${entry.value} }`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("gives the transit holiday links, the route map link and the park actions the link token", () => {
    const color = (file: string, selector: string) => {
      let value: string | undefined;
      postcss.parse(readFileSync(file, "utf8")).walkRules((rule) => {
        if (!rule.selector.split(",").some((part) => part.trim() === selector)) return;
        rule.walkDecls("color", (entry) => { value = entry.value; });
      });
      return value;
    };
    expect(color("src/components/transit/TransitHolidayNotice.module.css", ".sources a")).toBe("var(--app-link)");
    expect(color("src/components/transit/TransitHolidayNotice.module.css", ".railLink")).toBe("var(--app-link)");
    expect(color("src/components/transit/TransitExperience.module.css", ".mastheadGraphic")).toBe("var(--app-link)");
    expect(color("src/components/parks/ParkGuide.module.css", ".actions a")).toBe("var(--app-link)");
  });

  it("keeps a link token that dark appearance redefines", () => {
    // The link token is what the four rules above now read, so it must be
    // the pressed coral in light appearance and the light coral in dark.
    const link = new Map<string, string>();
    postcss.parse(readFileSync("src/app/globals.css", "utf8")).walkDecls("--app-link", (entry) => {
      link.set((entry.parent as postcss.Rule).selector, entry.value);
    });
    expect(Object.fromEntries(link)).toEqual({
      ":root": "var(--app-brand-press)",
      ':root[data-appearance="dark"]': "#FFAAA0",
    });
  });
});
