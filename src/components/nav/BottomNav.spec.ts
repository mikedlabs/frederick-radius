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

  it("clears optimistic state when a touch gesture is cancelled", () => {
    const source = readFileSync("src/components/nav/BottomNav.tsx", "utf8");
    expect(source).toContain("onPointerCancel={() => setPendingIdx(null)}");
    expect(source).toContain("if (event.buttons !== 0) setPendingIdx(null)");
  });
});
