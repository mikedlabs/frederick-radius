import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frederick Radius",
    short_name: "Radius",
    description:
      "Frederick Radius helps people find open places, local events, and practical information across Frederick County, Maryland.",
    start_url: "/today",
    scope: "/",
    id: "/",
    display: "standalone",
    orientation: "portrait-primary",
    // Launch on the paper-cream ground so the OS splash (Android shows the
    // maskable icon centered on background_color; iOS falls back to it when a
    // matched startup image is absent) reads as the same light app you land in
    // — no spruce-to-cream flash. Both colors are the real UI ground
    // (--app-bg = #EBE2CD) so the installed toolbar tint blends seamlessly.
    background_color: "#EBE2CD",
    theme_color: "#EBE2CD",
    lang: "en-US",
    categories: ["lifestyle", "navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      // Raster fallback for engines that don't honor sizes="any" SVG, and a
      // real 192px target for Android home-screen install (audit 2026-07).
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      // start_url is "/today". Ask is a focused decision tool rather than a
      // bottom tab, so the installed app keeps it one long-press away.
      { name: "Ask Radius", url: "/ask", short_name: "Ask" },
      { name: "Map", url: "/map", short_name: "Map" },
      { name: "Events", url: "/events", short_name: "Events" },
      { name: "Saved", url: "/my-radius", short_name: "Saved" },
    ],
  };
}
