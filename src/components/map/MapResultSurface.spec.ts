import { readFileSync } from "node:fs";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MapResultSurface from "./MapResultSurface";

describe("MapResultSurface", () => {
  it("renders a named, non-modal result region with a safe close button", () => {
    const html = renderToStaticMarkup(
      createElement(
        MapResultSurface,
        {
          className: "map-peek",
          ariaLabel: "Gravel and Grind",
          closeLabel: "Close Gravel and Grind",
          onClose: vi.fn(),
          children: "Result details",
        } as ComponentProps<typeof MapResultSurface>,
      ),
    );

    expect(html).toContain('data-map-result-surface="true"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Gravel and Grind"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Close Gravel and Grind"');
    expect(html).not.toContain('aria-modal="true"');
  });

  it("keeps global Escape and deterministic focus restoration in one close path", () => {
    const source = readFileSync(
      "src/components/map/MapResultSurface.tsx",
      "utf8",
    );

    expect(source).toContain(
      'window.addEventListener("keydown", closeFromAnywhere, true)',
    );
    expect(source).toContain(
      'window.removeEventListener("keydown", closeFromAnywhere, true)',
    );
    expect(source).toContain("event.isComposing");
    expect(source).toContain("closeRequestedRef.current");
    expect(source).toContain("const returnTarget = returnFocusRef.current");
    expect(source).toContain("canRestoreFocus(returnTarget)");
    expect(source).toContain("returnTarget.focus({ preventScroll: true })");
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).not.toContain("onKeyDown={");
  });
});
