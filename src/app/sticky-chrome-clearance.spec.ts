import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = postcss.parse(readFileSync("src/app/globals.css", "utf8"));

function baseLayerRule(selector: string): Map<string, string> {
  const found = new Map<string, string>();
  stylesheet.walkAtRules("layer", (layer) => {
    if (layer.params !== "base") return;
    layer.walkRules(selector, (rule) => {
      rule.walkDecls((entry) => { found.set(entry.prop, entry.value); });
    });
  });
  return found;
}

function rootTokens(): Set<string> {
  const tokens = new Set<string>();
  stylesheet.walkRules(":root", (rule) => {
    rule.walkDecls(/^--app-/, (entry) => { tokens.add(entry.prop); });
  });
  return tokens;
}

describe("content scrolled or focused under the sticky chrome", () => {
  const skipTarget = ":where(#main-content)";
  const controls = ":where(.app-main-reading) :where(a, button, summary, input, select, textarea, [tabindex])";

  it("lands Skip to content just under the header instead of beneath it", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const main = readFileSync("src/components/nav/AppMain.tsx", "utf8");
    expect(layout).toContain('href="#main-content"');
    expect(main).toContain('id="main-content"');
    // Header height is the measured row, the top safe area and the 1px rule.
    expect(baseLayerRule(skipTarget).get("scroll-margin-top"))
      .toBe("calc(var(--app-topbar-h) + env(safe-area-inset-top, 0px) + 1px)");
  });

  it("stops a focused control clear of the header and of the phone tab bar", () => {
    const margins = baseLayerRule(controls);
    expect(margins.get("scroll-margin-top")).toBe("calc(var(--app-topbar-h) + env(safe-area-inset-top, 0px) + 12px)");
    expect(margins.get("scroll-margin-bottom")).toBe("calc(var(--app-bottomnav-reserve) + env(safe-area-inset-bottom, 0px) + 12px)");
    // Block axis only: a horizontal rail's inline snapping is not touched.
    expect([...margins.keys()]).toEqual(["scroll-margin-top", "scroll-margin-bottom"]);
  });

  it("leaves a control in a bar pinned under the header where it is when it takes focus", () => {
    // A pinned bar's controls can never sit 12px below the header, so the
    // margin above scrolled the page on every focus (the Events display
    // summary moved the list 12px). Their margin is zero instead. Both rules
    // carry no specificity, so the later one in the same layer wins.
    const pinned = ':where(.eb-dock > .eb-head, [data-ask-composer-dock="sticky"], [data-nearby-filter-dock]) :where(a, button, summary, input, select, textarea, [tabindex])';
    expect([...baseLayerRule(pinned).entries()]).toEqual([["scroll-margin-top", "0"]]);
    const order: string[] = [];
    stylesheet.walkAtRules("layer", (layer) => {
      if (layer.params === "base") layer.walkRules((rule) => { order.push(rule.selector); });
    });
    expect(order.indexOf(pinned)).toBeGreaterThan(order.indexOf(controls));
    expect(pinned.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "").trim(), "no specificity").toBe("");
    // Each hook names a bar that really pins at the header's lower edge.
    const css = (path: string) => readFileSync(path, "utf8").replace(/\s+/g, " ");
    const dockTop: Record<string, string> = {};
    stylesheet.walkRules(".eb-dock", (rule) => { rule.walkDecls((entry) => { dockTop[entry.prop] = entry.value; }); });
    expect(dockTop).toMatchObject({ position: "sticky", top: "var(--app-topbar-offset)" });
    expect(readFileSync("src/components/event/EventsBoardDock.tsx", "utf8")).toMatch(/className=\{`eb-dock [\s\S]*?<div className="eb-head /);
    const ask = readFileSync("src/components/ask/AskFrederick.tsx", "utf8");
    expect(ask).toContain('data-ask-composer-dock={workspace && res ? "sticky" : undefined}');
    expect(ask).toContain('"sticky top-[var(--app-topbar-offset)]');
    expect(readFileSync("src/components/now/RightNow.tsx", "utf8")).toContain("<div className={styles.filterDock} data-nearby-filter-dock>");
    expect(css("src/components/now/RightNow.module.css")).toContain(".filterDock { position: sticky; top: calc(var(--app-topbar-offset)");
  });

  it("reads tokens the shell really defines", () => {
    const tokens = rootTokens();
    expect(tokens.has("--app-topbar-h")).toBe(true);
    expect(tokens.has("--app-bottomnav-reserve")).toBe(true);
    // TopBar keeps the first one equal to the header row it actually draws.
    expect(readFileSync("src/components/nav/TopBar.tsx", "utf8")).toContain('const property = "--app-topbar-h";');
  });

  it("stays below every utility and component margin in the cascade", () => {
    // An unlayered rule beats a layered Tailwind utility whatever its
    // specificity, so these two must live in the base layer and carry none.
    // The named sections on Today keep their own scroll-mt utilities this way.
    for (const selector of [skipTarget, controls]) {
      expect(baseLayerRule(selector).size, selector).toBeGreaterThan(0);
      stylesheet.walkRules(selector, (rule) => {
        const parent = rule.parent as postcss.AtRule;
        expect(parent.type === "atrule" && parent.name === "layer" && parent.params === "base", `${selector} is layered`).toBe(true);
      });
    }
    // A root scroll padding would add to the existing per-target margins.
    stylesheet.walkDecls(/^scroll-padding(-block)?(-top|-start)?$/, (entry) => {
      const selector = (entry.parent as postcss.Rule).selector;
      expect(selector, "no root scroll padding").not.toMatch(/^(html|:root|body)\b/);
    });
  });
});
