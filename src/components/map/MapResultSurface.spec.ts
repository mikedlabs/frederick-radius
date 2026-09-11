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
    expect(html).not.toContain("map-result-handle");
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

// ── Decision context for every map selection ─────────────────────────
//
// This component is the one surface every mobile map selection passes
// through: place, event, parking, live truck, discovery point. Carrying the
// decision context here rather than in each peek is what stops the next peek
// being born unmeasured, which is exactly how /map became the funnel's
// largest blind spot in the first place.
describe("MapResultSurface decision context", () => {
  const base = {
    className: "map-peek",
    ariaLabel: "Gravel and Grind",
    onClose: () => undefined,
    children: null,
  } satisfies ComponentProps<typeof MapResultSurface>;

  it("publishes the map context an action can inherit", () => {
    const html = renderToStaticMarkup(
      createElement(MapResultSurface, {
        ...base,
        decision: { entity: "place", id: "gravel-and-grind-frederick" },
      }),
    );

    expect(html).toContain('data-decision-impression="true"');
    expect(html).toContain('data-decision-surface="map"');
    expect(html).toContain('data-decision-entity="place"');
    expect(html).toContain('data-decision-id="gravel-and-grind-frederick"');
    // A selection raised from a pin is a sheet unless it says otherwise.
    expect(html).toContain('data-decision-position="sheet"');
  });

  it("stays silent when a surface has nothing to report", () => {
    const html = renderToStaticMarkup(createElement(MapResultSurface, base));

    // Not "false", not empty: absent. A surface with no decision must not
    // register an impression at all.
    expect(html).not.toContain("data-decision-impression");
    expect(html).not.toContain("data-decision-surface");
  });
});
