/** High-contrast endpoints for text over provider-supplied colors. */
export const CONTRAST_INK = "#000000";
export const CONTRAST_PAPER = "#FFFFFF";

const HEX_COLOR = /^#?([0-9a-f]{6})$/i;

/** WCAG relative luminance for a six-digit sRGB hex color. */
export function relativeLuminance(hex: string): number | null {
  const match = HEX_COLOR.exec(hex.trim());
  if (!match) return null;

  const value = Number.parseInt(match[1], 16);
  const channels = [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  ].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  });

  return (
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2]
  );
}

/** WCAG contrast ratio (1..21), or 0 when either color is not valid hex. */
export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance == null || backgroundLuminance == null) return 0;

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Choose paper or ink, whichever has the stronger contrast on a color. */
export function readableTextOn(background: string): string {
  const inkContrast = contrastRatio(CONTRAST_INK, background);
  const paperContrast = contrastRatio(CONTRAST_PAPER, background);
  return inkContrast >= paperContrast ? CONTRAST_INK : CONTRAST_PAPER;
}
