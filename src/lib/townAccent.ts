import { BRAND } from "@/lib/brand";

/**
 * Stable per-town accent color — a small fixed palette indexed by a hash of
 * the town slug, so the same town always draws the same chapter-rail color
 * across Happy Hour, Deals, and Saved. Extracted from three byte-identical
 * copies (the audit's "copy-pasted TOWN_ACCENTS arrays" finding); behavior is
 * unchanged (same palette, same hash).
 */
export const TOWN_ACCENTS = [
  BRAND.colors.brick,
  BRAND.colors.creek,
  BRAND.colors.forest,
  BRAND.colors.plum,
  BRAND.colors.functionalAmber,
  BRAND.colors.ridge,
];

export function townAccent(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return TOWN_ACCENTS[Math.abs(h) % TOWN_ACCENTS.length];
}
