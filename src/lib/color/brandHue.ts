import { BRAND } from "@/lib/brand";

/**
 * brandHue — the pure math behind the SavedWallet per-business card color.
 *
 * The wallet colors each card by the BUSINESS's own look: a brand hue is
 * extracted from its Google photo at build time (scripts/build-place-hues.ts)
 * and shipped as a static hex in src/data/place-hues.json. This module holds
 * everything deterministic about that extraction so it can be unit-tested
 * without images or network:
 *
 *   - gray rejection: which pixels count as "brand-colored" at all
 *   - hue clustering: pick the most-common vibrant hue from raw RGB pixels
 *   - the clamp: S into [0.35, 0.75], L into [0.30, 0.55], so every card
 *     sits in the same jewel-toned register as WALLET_GROUND
 *   - the AA guarantee: the wallet renders the hue through
 *     `color-mix(in srgb, hue 60%, #221C15)` (the light stop of the card
 *     gradient in SavedWallet.tsx); cream text on that mixed ground must
 *     clear WCAG AA 4.5:1. We compute the same mix here and, if a clamped
 *     hue fails, darken L below the clamp floor until it passes (contrast
 *     outranks the clamp) or give up and return null (the card falls back
 *     to its category ground).
 */

export const CREAM = BRAND.colors.cream; // --app-bg, the wallet card text color
export const INK = BRAND.colors.ink; // --app-ink, the gradient's dark partner
/** SavedWallet's light gradient stop is color-mix(in srgb, hue 60%, ink). */
export const GROUND_MIX = 0.6;
export const AA_MIN = 4.5;

/** The jewel-tone register every extracted brand hue is clamped into. */
export const S_MIN = 0.35;
export const S_MAX = 0.75;
export const L_MIN = 0.3;
export const L_MAX = 0.55;
/** AA rescue may darken L this far below L_MIN before giving up. */
export const L_FLOOR = 0.16;

export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad hex: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rn = 0,
    gn = 0,
    bn = 0;
  if (hp < 1) [rn, gn, bn] = [c, x, 0];
  else if (hp < 2) [rn, gn, bn] = [x, c, 0];
  else if (hp < 3) [rn, gn, bn] = [0, c, x];
  else if (hp < 4) [rn, gn, bn] = [0, x, c];
  else if (hp < 5) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  const m = l - c / 2;
  return { r: (rn + m) * 255, g: (gn + m) * 255, b: (bn + m) * 255 };
}

/**
 * color-mix(in srgb, a WEIGHT%, b) — plain channelwise interpolation in
 * gamma-encoded sRGB, which is exactly what the CSS srgb color space does.
 */
export function mixSrgb(a: RGB, b: RGB, weightA: number): RGB {
  const w = Math.max(0, Math.min(1, weightA));
  return {
    r: a.r * w + b.r * (1 - w),
    g: a.g * w + b.g * (1 - w),
    b: a.b * w + b.b * (1 - w),
  };
}

/** WCAG relative luminance of an sRGB color. */
export function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colors (order-independent, 1..21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The wallet card's light gradient stop for a given brand hue. */
export function walletGround(hueHex: string): RGB {
  return mixSrgb(hexToRgb(hueHex), hexToRgb(INK), GROUND_MIX);
}

/** Contrast of cream text over the wallet ground built from this hue. */
export function creamContrastOnGround(hueHex: string): number {
  return contrastRatio(hexToRgb(CREAM), walletGround(hueHex));
}

/**
 * Gray rejection — is this pixel colored enough to speak for the brand?
 * Near-white (photo sky, walls), near-black (shadows) and low-saturation
 * grays (asphalt, concrete — most of a storefront photo) say nothing about
 * the business's identity, so they never vote.
 */
export function isVibrant(rgb: RGB): boolean {
  const { s, l } = rgbToHsl(rgb);
  return s >= 0.2 && l >= 0.12 && l <= 0.85;
}

const HUE_BINS = 24; // 15-degree bins: tight enough to split red from orange

/**
 * Pick the dominant BRAND hue from raw RGB pixel data (as produced by
 * sharp's `.raw()`, channels=3). Vibrant pixels vote for a hue bin,
 * weighted by saturation so a small strongly-colored sign outvotes a large
 * washed-out lawn. Returns the circular-mean HSL of the winning bin and its
 * neighbors, or null when too few pixels are vibrant (a gray photo has no
 * brand hue — the card should fall back to its category color).
 */
export function dominantHue(
  pixels: Uint8Array | Uint8ClampedArray | number[],
  minVibrantShare = 0.02,
): HSL | null {
  const total = Math.floor(pixels.length / 3);
  if (total === 0) return null;
  const weight = new Array<number>(HUE_BINS).fill(0);
  // Per-bin circular hue accumulators + weighted s/l sums.
  const sinSum = new Array<number>(HUE_BINS).fill(0);
  const cosSum = new Array<number>(HUE_BINS).fill(0);
  const sSum = new Array<number>(HUE_BINS).fill(0);
  const lSum = new Array<number>(HUE_BINS).fill(0);
  let vibrant = 0;
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const rgb = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
    if (!isVibrant(rgb)) continue;
    vibrant++;
    const { h, s, l } = rgbToHsl(rgb);
    const bin = Math.min(HUE_BINS - 1, Math.floor(h / (360 / HUE_BINS)));
    const w = s; // saturation-weighted vote
    weight[bin] += w;
    const rad = (h * Math.PI) / 180;
    sinSum[bin] += Math.sin(rad) * w;
    cosSum[bin] += Math.cos(rad) * w;
    sSum[bin] += s * w;
    lSum[bin] += l * w;
  }
  if (vibrant / total < minVibrantShare) return null;
  // Winning bin including circular neighbors, so a hue straddling a bin
  // edge (e.g. 358° and 4° reds) is not split into two losing halves.
  let best = 0;
  let bestScore = -1;
  for (let b = 0; b < HUE_BINS; b++) {
    const score =
      weight[b] + weight[(b + 1) % HUE_BINS] + weight[(b + HUE_BINS - 1) % HUE_BINS];
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  const members = [best, (best + 1) % HUE_BINS, (best + HUE_BINS - 1) % HUE_BINS];
  let sin = 0,
    cos = 0,
    s = 0,
    l = 0,
    w = 0;
  for (const b of members) {
    sin += sinSum[b];
    cos += cosSum[b];
    s += sSum[b];
    l += lSum[b];
    w += weight[b];
  }
  if (w === 0) return null;
  let h = (Math.atan2(sin, cos) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { h, s: s / w, l: l / w };
}

/**
 * Clamp an extracted HSL into the wallet's jewel-tone register.
 * Saturation and lightness are boxed; hue is kept — the hue IS the brand.
 */
export function clampBrand({ h, s, l }: HSL): HSL {
  return {
    h: ((h % 360) + 360) % 360,
    s: Math.min(S_MAX, Math.max(S_MIN, s)),
    l: Math.min(L_MAX, Math.max(L_MIN, l)),
  };
}

/**
 * Clamp + AA-guarantee an extracted hue and return the final card hex.
 * If cream on the 60% ground mix misses 4.5:1 (bright yellows/cyans do),
 * darken L in small steps — below the clamp floor if needed, down to
 * L_FLOOR — and return null if it still can't pass.
 */
export function finalizeBrandHex(raw: HSL): string | null {
  const clamped = clampBrand(raw);
  let l = clamped.l;
  for (;;) {
    const hex = rgbToHex(hslToRgb({ h: clamped.h, s: clamped.s, l }));
    if (creamContrastOnGround(hex) >= AA_MIN) return hex;
    if (l <= L_FLOOR) return null;
    l = Math.max(l - 0.02, L_FLOOR);
  }
}
