import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Navigation, Phone } from "lucide-react";
import {
  MobileActionBar,
  MobileBarLink,
  MOBILE_BOTTOM_CHROME_RESERVE,
  barCellClass,
  barLabelClass,
} from "./MobileActionBar";

const RenderableMobileActionBar = MobileActionBar as ComponentType<{
  ariaLabel: string;
  children?: ReactNode;
}>;

function renderBar() {
  return renderToStaticMarkup(
    createElement(
      RenderableMobileActionBar,
      { ariaLabel: "Place actions" },
      createElement(MobileBarLink, {
        href: "tel:+13015550100",
        icon: Phone,
        label: "Call",
      }),
      createElement(MobileBarLink, {
        href: "https://maps.example/dir",
        icon: Navigation,
        label: "Directions",
        primary: true,
        external: true,
      }),
    ),
  );
}

describe("MobileActionBar shell contract", () => {
  it("owns the normal safe-area bottom edge instead of stacking over BottomNav", () => {
    const html = renderBar();

    expect(html).toContain("data-mobile-action-bar");
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("env(safe-area-inset-bottom, 0px) + 8px");
    expect(MOBILE_BOTTOM_CHROME_RESERVE).toContain("--app-bottomnav-reserve");
  });

  it("is a full-width solid bar with one top rule, not the floating tab-dock card", () => {
    const html = renderBar();
    const shell = html.slice(0, html.indexOf('role="toolbar"'));

    expect(shell).toContain("fixed inset-x-0 bottom-0 border-t");
    expect(shell).toContain("background:var(--app-bg-elevated-solid)");
    expect(shell).toContain("border-color:var(--app-border)");
    expect(html).not.toContain("box-shadow");
    expect(html).not.toContain("rounded-[var(--app-radius-lg)]");
    expect(html).not.toContain("pointer-events-none");
  });

  it("leads with one wide 48px brand-press primary that shows its glyph and label", () => {
    const html = renderBar();
    const primary = html.slice(html.indexOf('data-bar-primary="true"'));

    expect(barCellClass(true)).toContain("h-12");
    expect(barCellClass(true)).toContain("flex-1");
    expect(barCellClass(true)).toContain("order-first");
    expect(barCellClass(true)).toContain("rounded-[var(--app-radius-md)]");
    expect(primary).toContain("background:var(--app-brand-press)");
    expect(primary).toContain('<span class="truncate">Directions</span>');
    expect(html.match(/data-bar-primary="true"/g)).toHaveLength(1);
  });

  it("draws every other action as a 48px outlined square named for assistive tech", () => {
    const html = renderBar();

    expect(barCellClass(false)).toContain("h-12 w-12");
    expect(barCellClass(false)).toContain("border");
    expect(barLabelClass(false)).toBe("sr-only");
    expect(html).toContain('aria-label="Call"');
    expect(html).toContain('title="Call"');
    expect(html).toContain('<span class="sr-only">Call</span>');
  });
});
