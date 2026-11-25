import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const chrome = postcss.parse(readFileSync("src/components/nav/NavChrome.module.css", "utf8"));

/** Declarations for one selector inside one media query, as "prop: value". */
function inMedia(params: string, selector: string): string[] {
  const found: string[] = [];
  chrome.walkAtRules("media", (media) => {
    if (media.params !== params) return;
    media.walkRules((rule) => {
      if (!rule.selector.split(",").some((part) => part.trim() === selector)) return;
      rule.walkDecls((entry) => { found.push(`${entry.prop}: ${entry.value}`); });
    });
  });
  return found;
}

/** Declarations every width gets for one selector (rules outside any media query). */
function everywhere(selector: string): Record<string, string> {
  const found: Record<string, string> = {};
  chrome.walkRules((rule) => {
    if (rule.parent?.type !== "root") return;
    if (!rule.selector.split(",").some((part) => part.trim() === selector)) return;
    rule.walkDecls((entry) => { found[entry.prop] = entry.value; });
  });
  return found;
}

// These read the stylesheet only. They prove what the 280px block changes,
// not the rendered row: the widths in the comments were measured in Chromium
// with the system font, and a wider font can still wrap the actions.
describe("header below the narrowest documented phone", () => {
  const narrow = "(max-width: 319.98px)";

  it("drops the Find, More and area icons below 320px and keeps every word", () => {
    // At 280px the home link (141px), Find (62px) and More (66px) needed
    // 271px of the 260px row with their icons, so the actions wrapped under
    // the wordmark. Without the two icons they fit.
    for (const icon of [
      ".actions .search > svg",
      '.actions :global([data-find-density="header"]) a > span[aria-hidden]',
      ".actions .todayHeaderTrigger > svg",
      ".context .todayHeaderTrigger[data-today-area-trigger] > svg:first-child",
    ]) expect(inMedia(narrow, icon), icon).toEqual(["display: none"]);
    // Only icons are hidden: every rule in the block targets an svg or an
    // aria-hidden span, and none clips or shrinks text.
    chrome.walkAtRules("media", (media) => {
      if (media.params !== narrow) return;
      media.walkRules((rule) => {
        rule.walkDecls("display", (entry) => {
          if (entry.value !== "none") return;
          for (const part of rule.selector.split(",")) expect(part.trim(), "only an icon is hidden").toMatch(/(> svg(:first-child)?|> span\[aria-hidden\])$/);
        });
        rule.walkDecls((entry) => { expect(`${entry.prop}: ${entry.value}`).not.toMatch(/clip|font-size|visibility|width|overflow/); });
      });
    });
    // The printed words are the controls' accessible text.
    const topBar = readFileSync("src/components/nav/TopBar.tsx", "utf8");
    expect(topBar).toContain("<span>Find</span>");
    expect(topBar).toContain("<span>More</span>");
    // Both controls keep the shared 44px minimum at every width.
    for (const control of [".home", ".search", ".todayHeaderTrigger"]) {
      expect(everywhere(control), control).toMatchObject({ "min-height": "44px", "min-width": "44px" });
    }
  });

  it("lets the area and County status share a row when both fit and wrap when they do not", () => {
    // The phone grid needs two 8.75rem columns (288px) and so always stacked
    // the two controls on a 260px row. A wrapping flex row is content-sized.
    expect(inMedia("(max-width: 639.98px)", ".context")).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.75rem), 1fr))");
    expect(inMedia(narrow, ".context")).toEqual(["display: flex", "row-gap: 4px"]);
    expect(everywhere(".context")).toMatchObject({ display: "flex", "flex-wrap": "wrap" });
    // Each control keeps its own width and can never be wider than the row,
    // so a long town name wraps the status onto its own line.
    expect(everywhere(".context > *")).toMatchObject({ flex: "0 0 auto", "max-width": "100%" });
    // County status sits at the row's end when it shares the row.
    expect(inMedia(narrow, ".context :global([data-pulse-indicator])")).toEqual(["margin-inline-start: auto"]);
  });

  it("declares the 280px block after the wider phone blocks it overrides", () => {
    const order: string[] = [];
    chrome.walkAtRules("media", (media) => { order.push(media.params); });
    expect(order.indexOf(narrow)).toBeGreaterThan(order.indexOf("(max-width: 639.98px)"));
    expect(order.indexOf(narrow)).toBeGreaterThan(order.indexOf("(max-width: 359.98px)"));
    expect(order.filter((params) => params === narrow)).toHaveLength(1);
  });
});
