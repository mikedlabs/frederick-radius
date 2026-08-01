import type { MetadataRoute } from "next";
import { PLATFORM_BRAND } from "@/lib/platform-brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PLATFORM_BRAND.name,
    short_name: PLATFORM_BRAND.shortName,
    description: PLATFORM_BRAND.description,
    start_url: "/today",
    scope: "/",
    id: "/",
    display: "standalone",
    orientation: "portrait-primary",
    // Launch on the paper-cream ground so the OS splash (Android shows the
    // maskable icon centered on background_color; iOS falls back to it when a
    // matched startup image is absent) reads as the same light app you land in
    // — no dark-to-cream flash. Both colors are the canonical UI ground
    // (--app-bg = #F4EEE2) so the installed toolbar tint blends seamlessly.
    background_color: PLATFORM_BRAND.themeColor,
    theme_color: PLATFORM_BRAND.themeColor,
    lang: "en-US",
    dir: "ltr",
    categories: ["lifestyle", "navigation", "travel", "utilities"],
    icons: [
      { src: PLATFORM_BRAND.icons.anySvg, sizes: "any", type: "image/svg+xml", purpose: "any" },
      // Maskable uses the FULL-BLEED variant (square brick, no squircle
      // corners) — the launcher applies its own mask, and transparent corners
      // would show through it.
      { src: PLATFORM_BRAND.icons.maskableSvg, sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      // Raster fallback for engines that don't honor sizes="any" SVG, and a
      // real 192px target for Android home-screen install (audit 2026-07).
      { src: PLATFORM_BRAND.icons.any192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: PLATFORM_BRAND.icons.any512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: PLATFORM_BRAND.icons.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
      // Static file now (was the generated /apple-icon route) — full-bleed
      // 180px PNG; iOS masks its own corners.
      { src: PLATFORM_BRAND.icons.apple180, sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      // start_url is "/today". Ask is a focused decision tool rather than a
      // bottom tab, so the installed app keeps it one long-press away.
      { name: "Ask Radius", url: "/ask", short_name: "Ask" },
      { name: "Map", url: "/map", short_name: "Map" },
      { name: "Events", url: "/events", short_name: "Events" },
      { name: "Saved", url: "/my-radius", short_name: "Saved" },
    ],
    screenshots: [
      {
        src: "/brand/examples/ui-today-mobile.webp",
        sizes: "780x1440",
        type: "image/webp",
        form_factor: "narrow",
        label: "Today in Frederick County",
      },
      {
        src: "/brand/examples/ui-map-mobile.webp",
        sizes: "780x1688",
        type: "image/webp",
        form_factor: "narrow",
        label: "Explore Frederick County on the live map",
      },
      {
        src: "/brand/examples/ui-compass-mobile.webp",
        sizes: "780x1688",
        type: "image/webp",
        form_factor: "narrow",
        label: "Open Frederick Radius tools from Compass",
      },
    ],
  };
}
