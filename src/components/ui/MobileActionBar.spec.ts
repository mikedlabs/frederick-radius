import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MobileActionBar,
  MOBILE_BOTTOM_CHROME_RESERVE,
} from "./MobileActionBar";

describe("MobileActionBar shell contract", () => {
  it("owns the normal safe-area bottom edge instead of stacking over BottomNav", () => {
    const RenderableMobileActionBar = MobileActionBar as ComponentType<{
      ariaLabel: string;
      children?: ReactNode;
    }>;
    const html = renderToStaticMarkup(
      createElement(
        RenderableMobileActionBar,
        { ariaLabel: "Place actions" },
        createElement("button", { type: "button" }, "Save"),
      ),
    );

    expect(html).toContain("data-mobile-action-bar");
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("env(safe-area-inset-bottom, 0px) + 8px");
    expect(MOBILE_BOTTOM_CHROME_RESERVE).toContain("--app-bottomnav-reserve");
  });
});
