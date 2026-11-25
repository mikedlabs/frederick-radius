import { describe, expect, it } from "vitest";
import { sheetOffsetPx, sheetScrimOpacity } from "./BottomSheet";

/**
 * The entrance and exit animate the sheet in percent of its own height while
 * a drag reports pixels. The scrim once read only pixels, so with motion on
 * every sheet opened with no scrim at all until it was first dragged.
 */
describe("sheet scrim follows the sheet", () => {
  const panel = 717;

  it("is fully dark at rest in either unit", () => {
    expect(sheetScrimOpacity(0, panel)).toBe(0.45);
    expect(sheetScrimOpacity("0%", panel)).toBe(0.45);
    expect(sheetScrimOpacity("0px", panel)).toBe(0.45);
  });

  it("clears over 300px of downward travel during a pull", () => {
    expect(sheetScrimOpacity(60, panel)).toBeCloseTo(0.36, 5);
    expect(sheetScrimOpacity(150, panel)).toBeCloseTo(0.225, 5);
    expect(sheetScrimOpacity(300, panel)).toBe(0);
    expect(sheetScrimOpacity(600, panel)).toBe(0);
  });

  it("reads the entrance and exit percentages as the same pixel distance", () => {
    expect(sheetScrimOpacity("100%", panel)).toBe(0);
    // 20.92% of a 717px panel is 150px below rest.
    expect(sheetScrimOpacity("20.92%", panel)).toBeCloseTo(sheetScrimOpacity(150, panel), 3);
    expect(sheetScrimOpacity("150px", panel)).toBe(sheetScrimOpacity(150, panel));
  });

  it("never exceeds its resting strength when the spring overshoots upward", () => {
    expect(sheetScrimOpacity(-12, panel)).toBe(0.45);
    expect(sheetScrimOpacity("-1.5%", panel)).toBe(0.45);
  });

  it("lets a panel shorter than the fade distance reach a clear scrim", () => {
    expect(sheetScrimOpacity("100%", 220)).toBe(0);
    expect(sheetScrimOpacity(110, 220)).toBeCloseTo(0.225, 5);
  });

  it("treats an unmeasured panel as away once it has any offset, and never returns NaN", () => {
    expect(sheetScrimOpacity("100%", 0)).toBe(0);
    expect(sheetScrimOpacity("0%", 0)).toBe(0.45);
    expect(sheetScrimOpacity("not a length", panel)).toBe(0.45);
  });
});

/**
 * A drag starts from this number. Motion converts the entrance's "0%" itself
 * only while it holds a layout measurement, and it drops that measurement when
 * the sheet renders just after a window resize. The drag then started from the
 * string and wrote "0%6" as a position.
 */
describe("sheet offset reads as pixels below rest", () => {
  it("passes pixels through and reads the resting percentage as zero", () => {
    expect(sheetOffsetPx(42, 717)).toBe(42);
    expect(sheetOffsetPx("42px", 717)).toBe(42);
    expect(sheetOffsetPx("0%", 717)).toBe(0);
  });

  it("converts a percentage of the panel's own height", () => {
    expect(sheetOffsetPx("100%", 717)).toBe(717);
    expect(sheetOffsetPx("37.5%", 400)).toBe(150);
    expect(sheetOffsetPx("-0.5%", 400)).toBe(-2);
  });

  it("has no finite answer for an offset on an unmeasured panel", () => {
    expect(sheetOffsetPx("37.5%", 0)).toBe(Number.POSITIVE_INFINITY);
    expect(sheetOffsetPx("0%", 0)).toBe(0);
    expect(sheetOffsetPx("not a length", 717)).toBe(0);
  });
});
