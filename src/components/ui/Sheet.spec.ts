import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Sheet compatibility surface", () => {
  const source = readFileSync("src/components/ui/Sheet.tsx", "utf8");
  const globals = readFileSync("src/app/globals.css", "utf8");

  it("uses the canonical BottomSheet interaction contract", () => {
    expect(source).toContain('from "@/components/ui/BottomSheet"');
    expect(source).toContain("<BottomSheet");
    expect(source).toContain("<SheetHandle");
    expect(source).not.toContain("createPortal");
    expect(source).not.toContain("onTouchMove");
  });

  it("keeps content and actions inside the same safe-area surface", () => {
    expect(source).toContain("overflow-y-auto overscroll-contain");
    expect(source).toContain("env(safe-area-inset-left");
    expect(source).toContain("env(safe-area-inset-right");
    expect(source).toContain("<footer");
  });

  it("lets an open modal sheet own the mobile bottom edge", () => {
    expect(globals).toMatch(
      /html:has\(\[data-bottom-sheet-panel\]\) \[data-bottom-nav-shell\] \{\s+visibility: hidden;\s+pointer-events: none;\s+\}/,
    );
  });
});
