import { describe, expect, it } from "vitest";
import { BRAND, RIPPLE_GEOMETRY, rippleDetailForSize } from "./brand";

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((part) => Number.parseInt(part, 16) / 255)
    .map((channel) =>
      channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("Frederick Radius brand contract", () => {
  it("keeps the public promise and system name canonical", () => {
    expect(BRAND.tagline).toBe("Frederick County starts where you are.");
    expect(BRAND.system).toBe("Frederick Radius Brand System");
  });

  it("keeps brand text colors readable on Cream", () => {
    expect(contrast(BRAND.colors.ink, BRAND.colors.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND.colors.brick, BRAND.colors.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND.colors.forest, BRAND.colors.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND.colors.creek, BRAND.colors.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND.colors.plum, BRAND.colors.cream)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND.colors.mutedInk, BRAND.colors.cream)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps functional boundaries and Amber usage accessible", () => {
    expect(contrast(BRAND.colors.controlBorder, BRAND.colors.cream)).toBeGreaterThanOrEqual(3);
    expect(contrast(BRAND.colors.cream, BRAND.colors.forest)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND.colors.ink, BRAND.colors.amber)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND.colors.functionalAmber, BRAND.colors.cream)).toBeGreaterThanOrEqual(4.5);
  });

  it("selects the correct optical Ripple detail", () => {
    expect(rippleDetailForSize(16)).toBe("favicon");
    expect(rippleDetailForSize(24)).toBe("compact");
    expect(rippleDetailForSize(47)).toBe("compact");
    expect(rippleDetailForSize(48)).toBe("full");
  });

  it("keeps production Ripple marks solid", () => {
    expect(RIPPLE_GEOMETRY.full.opacities.every((opacity) => opacity === 1)).toBe(true);
    expect(RIPPLE_GEOMETRY.compact.opacities.every((opacity) => opacity === 1)).toBe(true);
    expect(RIPPLE_GEOMETRY.favicon.opacities).toEqual([1]);
  });
});
