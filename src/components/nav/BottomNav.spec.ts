import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isPlainPrimaryNavigation,
  shouldShowBottomNav,
} from "./BottomNav";

describe("BottomNav contextual chrome", () => {
  it("yields the bottom edge only to a real contextual action bar", () => {
    expect(shouldShowBottomNav("/places/gravel-and-grind", true)).toBe(false);
    expect(shouldShowBottomNav("/events/alive-at-five-2026", true)).toBe(false);
    expect(shouldShowBottomNav("/ask")).toBe(true);
    expect(shouldShowBottomNav("/ask/history")).toBe(true);
  });

  it("stays present whenever a contextual bar was not actually rendered", () => {
    expect(shouldShowBottomNav("/today")).toBe(true);
    expect(shouldShowBottomNav("/map")).toBe(true);
    expect(shouldShowBottomNav("/events")).toBe(true);
    expect(shouldShowBottomNav("/events/calendar")).toBe(true);
    expect(shouldShowBottomNav("/events/missing-event")).toBe(true);
    expect(shouldShowBottomNav("/my-radius")).toBe(true);
  });

  it("marks only an exact primary destination as the current page", () => {
    for (const file of [
      "src/components/nav/BottomNav.tsx",
      "src/components/nav/SideRail.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain(
        'aria-current={isAtDestination ? "page" : undefined}',
      );
      expect(source).not.toContain(
        'aria-current={isRealActive ? "page" : undefined}',
      );
    }
  });

  it("leaves modified and non-primary clicks to the browser", () => {
    const plain = {
      button: 0,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    };

    expect(isPlainPrimaryNavigation(plain)).toBe(true);
    expect(isPlainPrimaryNavigation({ ...plain, metaKey: true })).toBe(false);
    expect(isPlainPrimaryNavigation({ ...plain, ctrlKey: true })).toBe(false);
    expect(isPlainPrimaryNavigation({ ...plain, button: 1 })).toBe(false);
  });

  it("draws a flat bar on the screen edge that marks the current and pending tabs plainly", () => {
    const source = readFileSync("src/components/nav/BottomNav.tsx", "utf8");
    const chrome = readFileSync("src/components/nav/NavChrome.module.css", "utf8").replace(/\s+/g, " ");
    // Attached to the edge: no floating inset, no capsule, no slab.
    expect(source).toContain('paddingBottom: "env(safe-area-inset-bottom, 0px)"');
    expect(source).not.toMatch(/rounded-(full|\[var\(--app-radius-(lg|xl)\)\])/);
    expect(chrome).toContain(".dockShell { background: var(--app-bg); border-top: 1px solid var(--app-border); }");
    expect(chrome).not.toMatch(/\.destination\[data-selected="true"\] \{[^}]*background/);
    // Current: a coral rule, a 700 label and a heavier icon stroke.
    expect(chrome).toContain('.destination[data-selected="true"] .destinationRule { background: var(--app-brand); }');
    expect(chrome).toContain('.destination[data-selected="true"] .destinationLabel { font-weight: 700; }');
    expect(source).toContain("strokeWidth={active ? 2.5 : 1.75}");
    // Pending: the same rule in ink at reduced opacity.
    expect(chrome).toContain('.destination[data-pending="true"]:not([data-selected="true"]) .destinationRule { background: var(--app-ink); opacity: 0.45; }');
    // Every destination keeps a 56px row and a visible focus ring.
    expect(source).toContain("relative flex h-14 w-full");
    expect(chrome).toContain(".destination:focus-visible { outline: 2px solid var(--app-brand); outline-offset: -3px; }");
  });

  it("clears optimistic state when a touch gesture is cancelled", () => {
    const source = readFileSync("src/components/nav/BottomNav.tsx", "utf8");
    expect(source).toContain("onPointerCancel={() => setPendingIdx(null)}");
    expect(source).toContain("if (event.buttons !== 0) setPendingIdx(null)");
  });
});
