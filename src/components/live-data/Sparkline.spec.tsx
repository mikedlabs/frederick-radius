import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Sparkline, { sparklineDomain } from "./Sparkline";

/** The y coordinates of the drawn line, read back from its path. */
function lineYs(markup: string): number[] {
  const paths = [...markup.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
  const line = paths.find((d) => !d.includes("Z"));
  if (!line) throw new Error("Sparkline drew no line");
  return [...line.matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((match) => Number(match[1]));
}

describe("Sparkline vertical range", () => {
  it("draws a steady gauge as a nearly flat line, not a full-height square wave", () => {
    // A river gauge that wobbled one hundredth of a foot: the trend label
    // says Steady, and the picture must agree.
    const values = [5.84, 5.85, 5.84, 5.85, 5.84, 5.85, 5.84, 5.85];
    const height = 36;
    const ys = lineYs(renderToStaticMarkup(<Sparkline values={values} height={height} fillOpacity={0} />));

    const swing = Math.max(...ys) - Math.min(...ys);
    expect(swing).toBeLessThan(height * 0.1);
  });

  it("still uses the full height for a real rise", () => {
    const values = [2.1, 2.4, 2.9, 3.6, 4.4, 5.2];
    const height = 36;
    const ys = lineYs(renderToStaticMarkup(<Sparkline values={values} height={height} fillOpacity={0} />));

    const swing = Math.max(...ys) - Math.min(...ys);
    expect(swing).toBeGreaterThan(height * 0.8);
  });

  it("centers a narrow series inside the floored domain", () => {
    const domain = sparklineDomain([10, 10.1]);
    expect(domain.max - domain.min).toBeCloseTo(0.5025, 4);
    expect((domain.max + domain.min) / 2).toBeCloseTo(10.05, 6);
  });

  it("keeps a wide series at its own extent", () => {
    expect(sparklineDomain([100, 400])).toEqual({ min: 100, max: 400 });
  });

  it("lets a caller that knows its units set the floor", () => {
    expect(sparklineDomain([800, 805], 100)).toEqual({ min: 752.5, max: 852.5 });
  });

  it("puts a constant series in the middle instead of dividing by zero", () => {
    const zero = sparklineDomain([0, 0, 0], 0);
    expect(zero).toEqual({ min: -0.5, max: 0.5 });
    const ys = lineYs(renderToStaticMarkup(<Sparkline values={[3, 3, 3]} height={40} fillOpacity={0} />));
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBeCloseTo(20, 5);
  });
});
