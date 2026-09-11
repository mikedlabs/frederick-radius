import { describe, expect, it } from "vitest";
import {
  AA_MIN,
  CREAM,
  INK,
  L_FLOOR,
  L_MAX,
  L_MIN,
  S_MAX,
  S_MIN,
  clampBrand,
  contrastRatio,
  creamContrastOnGround,
  dominantHue,
  finalizeBrandHex,
  hexToRgb,
  isVibrant,
  mixSrgb,
  rgbToHex,
  rgbToHsl,
  walletGround,
} from "@/lib/color/brandHue";

describe("brandHue — clamp bounds", () => {
  it("boxes saturation into [S_MIN, S_MAX]", () => {
    expect(clampBrand({ h: 20, s: 0.95, l: 0.4 }).s).toBe(S_MAX);
    expect(clampBrand({ h: 20, s: 0.05, l: 0.4 }).s).toBe(S_MIN);
    expect(clampBrand({ h: 20, s: 0.5, l: 0.4 }).s).toBe(0.5);
  });

  it("boxes lightness into [L_MIN, L_MAX]", () => {
    expect(clampBrand({ h: 20, s: 0.5, l: 0.9 }).l).toBe(L_MAX);
    expect(clampBrand({ h: 20, s: 0.5, l: 0.05 }).l).toBe(L_MIN);
    expect(clampBrand({ h: 20, s: 0.5, l: 0.42 }).l).toBe(0.42);
  });

  it("keeps hue (mod 360) — the hue IS the brand", () => {
    expect(clampBrand({ h: 380, s: 0.5, l: 0.4 }).h).toBe(20);
    expect(clampBrand({ h: -30, s: 0.5, l: 0.4 }).h).toBe(330);
  });

  it("finalizeBrandHex output stays inside the register (S box, L <= max)", () => {
    // A screaming out-of-register input.
    const hex = finalizeBrandHex({ h: 15, s: 1, l: 0.95 });
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    const { s, l } = rgbToHsl(hexToRgb(hex!));
    expect(s).toBeGreaterThanOrEqual(S_MIN - 0.02); // hex rounding wiggle
    expect(s).toBeLessThanOrEqual(S_MAX + 0.02);
    expect(l).toBeLessThanOrEqual(L_MAX + 0.02);
  });
});

describe("brandHue — AA contrast math", () => {
  it("contrastRatio matches known WCAG anchors", () => {
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5); // order-independent
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("mixSrgb reproduces CSS color-mix in srgb (channelwise)", () => {
    const mixed = mixSrgb({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }, 0.6);
    expect(mixed.r).toBeCloseTo(153, 5);
    expect(mixed.g).toBeCloseTo(153, 5);
    expect(mixed.b).toBeCloseTo(153, 5);
  });

  it("walletGround is the card's light stop: 60% hue over ink", () => {
    const ink = hexToRgb(INK);
    const g = walletGround("#FFFFFF");
    expect(g.r).toBeCloseTo(255 * 0.6 + ink.r * 0.4, 5);
    expect(g.b).toBeCloseTo(255 * 0.6 + ink.b * 0.4, 5);
  });

  it("every finalized hue clears AA for cream on the mixed ground", () => {
    // Sweep the wheel with worst-case bright, saturated inputs (yellows and
    // cyans are the hues that fail at the clamp ceiling and need rescue).
    for (let h = 0; h < 360; h += 10) {
      const hex = finalizeBrandHex({ h, s: 1, l: 0.55 });
      expect(hex, `hue ${h} should be rescuable`).not.toBeNull();
      expect(
        creamContrastOnGround(hex!),
        `hue ${h} (${hex}) cream contrast`,
      ).toBeGreaterThanOrEqual(AA_MIN);
    }
  });

  it("rescue darkens below L_MIN when the clamped hue fails", () => {
    // Pure yellow at the L ceiling fails 4.5:1 on the 60% mix; the rescue
    // must land below the normal clamp floor's ceiling, not bail out.
    const hex = finalizeBrandHex({ h: 60, s: 0.75, l: 0.55 })!;
    const { l } = rgbToHsl(hexToRgb(hex));
    expect(l).toBeLessThan(L_MAX);
    expect(l).toBeGreaterThanOrEqual(L_FLOOR - 0.01);
    expect(creamContrastOnGround(hex)).toBeGreaterThanOrEqual(AA_MIN);
  });

  it("cream really is the reference text color", () => {
    expect(CREAM).toBe("#F4EEE2");
  });
});

describe("brandHue — gray rejection", () => {
  it("rejects near-white, near-black, and low-sat gray pixels", () => {
    expect(isVibrant({ r: 245, g: 243, b: 240 })).toBe(false); // near-white
    expect(isVibrant({ r: 12, g: 12, b: 14 })).toBe(false); // near-black
    expect(isVibrant({ r: 128, g: 128, b: 128 })).toBe(false); // pure gray
    expect(isVibrant({ r: 120, g: 125, b: 130 })).toBe(false); // asphalt
    expect(isVibrant({ r: 200, g: 40, b: 40 })).toBe(true); // brand red
    expect(isVibrant({ r: 30, g: 110, b: 60 })).toBe(true); // brand green
  });

  it("dominantHue returns null for an all-gray image", () => {
    const px: number[] = [];
    for (let i = 0; i < 500; i++) px.push(128, 128, 128);
    expect(dominantHue(px)).toBeNull();
  });

  it("gray majority does not drown out a vibrant minority", () => {
    // 90% concrete gray + 10% brand red: the red must win.
    const px: number[] = [];
    for (let i = 0; i < 900; i++) px.push(130, 130, 132);
    for (let i = 0; i < 100; i++) px.push(200, 40, 40);
    const hsl = dominantHue(px);
    expect(hsl).not.toBeNull();
    // Red lives at hue 0; allow the wrap.
    const h = hsl!.h;
    expect(h < 25 || h > 335).toBe(true);
  });

  it("dominantHue picks the most-common vibrant hue, saturation-weighted", () => {
    const px: number[] = [];
    for (let i = 0; i < 300; i++) px.push(40, 90, 200); // blue majority
    for (let i = 0; i < 120; i++) px.push(220, 150, 40); // amber minority
    const hsl = dominantHue(px)!;
    expect(hsl.h).toBeGreaterThan(180);
    expect(hsl.h).toBeLessThan(260);
  });

  it("round-trips hex <-> rgb", () => {
    expect(rgbToHex(hexToRgb("#E14328"))).toBe("#E14328");
  });
});
