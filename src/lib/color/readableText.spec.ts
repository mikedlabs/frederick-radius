import { describe, expect, it } from "vitest";
import TRANSIT from "@/data/transit.json";
import {
  contrastRatio,
  readableTextOn,
  relativeLuminance,
} from "./readableText";

type TransitRoute = {
  id: string;
  short: string;
  color: string;
};

describe("readableTextOn", () => {
  it("uses WCAG relative luminance", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBe(1);
    expect(relativeLuminance("#777777")).toBeCloseTo(0.1845, 3);
  });

  it.each(TRANSIT.routes as TransitRoute[])(
    "keeps route $short text at WCAG AA contrast",
    (route) => {
      const foreground = readableTextOn(route.color);

      expect(
        contrastRatio(foreground, route.color),
        `route ${route.short} (${route.id}) uses ${foreground} on ${route.color}`,
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
