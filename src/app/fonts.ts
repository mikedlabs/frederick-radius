import localFont from "next/font/local";

/**
 * Self-hosted brand faces for optional editorial use and standalone artwork.
 * Product UI uses the native system stack; neither specialty font competes
 * with its first paint through a global preload. Metric-matched fallbacks
 * still prevent reflow wherever a brand face is deliberately used.
 */

export const publicSans = localFont({
  src: [
    {
      path: "../../public/brand/fonts/public-sans-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-public-sans",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
});

export const libreCaslonDisplay = localFont({
  src: [
    {
      path: "../../public/brand/fonts/libre-caslon-display-400.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-libre-caslon",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  fallback: ["ui-serif", "Georgia", "serif"],
});
