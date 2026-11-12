import { readFileSync } from "node:fs";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Navigation, Phone } from "lucide-react";
import {
  MobileActionBar,
  MobileBarLink,
  MOBILE_ACTION_BAR_HEIGHT_PX,
  MOBILE_BOTTOM_CHROME_RESERVE,
  barCellClass,
  barCellStyle,
} from "./MobileActionBar";

const RenderableMobileActionBar = MobileActionBar as ComponentType<{
  ariaLabel: string;
  children?: ReactNode;
}>;

function renderBar(...children: ReactNode[]): string {
  return renderToStaticMarkup(
    createElement(RenderableMobileActionBar, { ariaLabel: "Place actions" }, ...children),
  );
}

describe("MobileActionBar shell contract", () => {
  it("owns the normal safe-area bottom edge instead of stacking over BottomNav", () => {
    const html = renderBar(createElement("button", { type: "button" }, "Save"));

    expect(html).toContain("data-mobile-action-bar");
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Place actions"');
    expect(html).toContain("lg:hidden");
    expect(MOBILE_BOTTOM_CHROME_RESERVE).toContain("--app-bottomnav-reserve");
  });

  it("is a flat bar attached to the bottom edge, not a floating card", () => {
    const html = renderBar(createElement("button", { type: "button" }, "Save"));

    // Attached: pinned at bottom 0 with only the safe area below it.
    expect(html).toContain("fixed inset-x-0 bottom-0");
    expect(html).toContain("padding-bottom:env(safe-area-inset-bottom, 0px)");
    expect(html).not.toContain("+ 8px");
    // Each side clears its own inset in landscape.
    expect(html).toContain("padding-left:env(safe-area-inset-left, 0px)");
    expect(html).toContain("padding-right:env(safe-area-inset-right, 0px)");
    // Flat: the page ground and one top hairline, with no lift.
    expect(html).toContain("background:var(--app-bg)");
    expect(html).toContain("border-top:1px solid var(--app-border)");
    expect(html).not.toContain("box-shadow");
    expect(html).not.toContain("rounded-[var(--app-radius-lg)]");
    expect(html).not.toContain("pointer-events-none");
  });

  it("fits the shared bottom-chrome reserve so the page never hides under it", () => {
    const html = renderBar(createElement("button", { type: "button" }, "Save"));

    // 4px + 48px cell row + 4px + 1px hairline = the 57px reserve token.
    expect(html).toContain("py-1");
    expect(barCellClass(true)).toContain("min-h-12");
    expect(barCellClass(false)).toContain("min-h-12");
    expect(4 + 48 + 4 + 1).toBe(MOBILE_ACTION_BAR_HEIGHT_PX);

    const css = readFileSync("src/app/globals.css", "utf8");
    const token = /--app-bottomnav-reserve:\s*(\d+)px/.exec(css);
    expect(Number(token?.[1])).toBe(MOBILE_ACTION_BAR_HEIGHT_PX);
    // The reading column's mobile bottom padding exceeds the bar plus the
    // bottom safe area, so the last content always scrolls clear of it.
    const reserve = /\.app-main-reading\[data-bottom-nav-reserve="true"\]\s*\{\s*padding-bottom:\s*calc\((\d+(?:\.\d+)?)rem \+ env\(safe-area-inset-bottom, 0px\)\)/.exec(css);
    expect(reserve).not.toBeNull();
    expect(Number(reserve?.[1]) * 16).toBeGreaterThanOrEqual(MOBILE_ACTION_BAR_HEIGHT_PX);
  });
});

describe("MobileActionBar cells", () => {
  it("keeps one filled coral action on the AA-safe press color and quiet ink cells", () => {
    expect(barCellStyle(true)).toEqual({
      background: "var(--app-brand-press)",
      color: "var(--app-on-brand)",
    });
    expect(barCellStyle(false)).toEqual({ color: "var(--app-ink)" });
    // Capsules are reserved for filter chips; bar cells use the 6px radius.
    expect(barCellClass(true)).toContain("rounded-[var(--app-radius-md)]");
    expect(barCellClass(false)).toContain("rounded-[var(--app-radius-md)]");
    expect(barCellClass(true)).not.toContain("rounded-full");
  });

  it("gives every cell a 44px target and an accessible name", () => {
    const html = renderBar(
      createElement(MobileBarLink, {
        href: "https://maps.example/dir",
        icon: Navigation,
        label: "Directions",
        ariaLabel: "Directions to Baker Park",
        external: true,
        primary: true,
        decisionAction: "directions",
      }),
      createElement(MobileBarLink, {
        href: "tel:3015550100",
        icon: Phone,
        label: "Call",
        ariaLabel: "Call Baker Park",
        decisionAction: "call",
      }),
    );

    expect(html.match(/tap-44/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('aria-label="Directions to Baker Park"');
    expect(html).toContain('aria-label="Call Baker Park"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('data-decision-action="directions"');
    expect(html.match(/background:var\(--app-brand-press\)/g)).toHaveLength(1);
  });

  it("cannot overflow: quiet cells shrink to their icon when the bar is narrow or text is enlarged", () => {
    expect(barCellClass(false)).toContain("app-bar-cell-quiet");
    expect(barCellClass(true)).toContain("app-bar-cell-primary");
    // Text sizes follow the reader's text size.
    expect(barCellClass(false)).toContain("text-[0.75rem]");
    expect(barCellClass(true)).toContain("text-[0.9375rem]");
    const html = renderBar(createElement("button", { type: "button" }, "Save"));
    expect(html).toContain("data-mobile-action-toolbar");
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\[data-mobile-action-toolbar\]\s*\{\s*container:\s*app-action-bar \/ inline-size;/);
    const query = /@container app-action-bar \(max-width: (\d+(?:\.\d+)?)rem\)\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(query).not.toBeNull();
    // The threshold is in rem so it trips when text grows, not only on
    // narrow screens.
    expect(Number(query?.[1])).toBeGreaterThan(18);
    expect(query?.[2]).toMatch(/\.app-bar-cell-quiet\s*\{[^}]*min-width:\s*0;[^}]*font-size:\s*0;/);
  });
});
