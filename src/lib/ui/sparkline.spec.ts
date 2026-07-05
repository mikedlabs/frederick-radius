import { describe, it, expect } from "vitest";
import { sparklinePath } from "./sparkline";

describe("sparklinePath", () => {
  it("returns null for fewer than two points", () => {
    expect(sparklinePath([])).toBeNull();
    expect(sparklinePath([5])).toBeNull();
  });

  it("starts with a move and then one line segment per remaining point", () => {
    const g = sparklinePath([1, 2, 3, 4], 100, 24)!;
    expect(g.line.startsWith("M")).toBe(true);
    expect((g.line.match(/L/g) ?? []).length).toBe(3);
  });

  it("spans the full width and puts the max at the top (smallest y)", () => {
    const g = sparklinePath([0, 10], 100, 24, 2)!;
    // first x = 0, last x = width
    expect(g.line).toContain("M0.00");
    expect(g.last.x).toBeCloseTo(100, 3);
    // the higher value (10) maps to the padded top
    expect(g.last.y).toBeCloseTo(2, 3);
  });

  it("does not divide by zero on a flat series", () => {
    const g = sparklinePath([5, 5, 5], 100, 24)!;
    expect(Number.isFinite(g.last.y)).toBe(true);
  });

  it("closes the area path back to the baseline", () => {
    const g = sparklinePath([1, 3, 2], 100, 24)!;
    expect(g.area.endsWith("Z")).toBe(true);
    expect(g.area).toContain("L100.00 24");
  });
});
