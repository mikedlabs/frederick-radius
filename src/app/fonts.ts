import localFont from "next/font/local";

/**
 * The brand faces, loaded through next/font.
 *
 * These were already self-hosted through Fontsource, so the win here is not
 * "stop calling Google Fonts" — that was already true. It is the fallback
 * metrics. Fontsource emits plain @font-face rules, which means the browser
 * paints Arial at Arial's proportions and then reflows the entire page when
 * Public Sans arrives. next/font reads the real metrics out of the woff2 and
 * synthesises a fallback with matching size-adjust, ascent-override and
 * descent-override, so the fallback occupies the same space as the webfont
 * and the swap costs no layout shift.
 *
 * It also emits a preload for the upright face used on every screen. The rare
 * Public Sans italic is declared in globals.css without a preload so a 30KB
 * specialty face does not compete with first paint across the whole app.
 *
 * The woff2 files are the ones already in public/brand/fonts. They stay
 * there as well as being bundled here, because three things load them
 * independently of the app shell and must keep doing so: global-error.tsx
 * (which renders when the layout itself has failed), the OG image route, and
 * the place-photo SVG route. None of those can reach a next/font variable.
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
  adjustFontFallback: "Times New Roman",
  fallback: ["ui-serif", "Georgia", "serif"],
});
