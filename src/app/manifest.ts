import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frederick Radius",
    short_name: "Radius",
    description: "A better way to use Frederick County.",
    start_url: "/guide",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    // Brand-deck launch: Spruce field (matches the app-icon ground) with
    // a Paper in-app toolbar tint that blends with the UI ground.
    background_color: "#16352B",
    theme_color: "#EEE6D4",
    lang: "en-US",
    categories: ["lifestyle", "navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      // URLs match start_url ("/guide") and the four primary BottomNav
      // tabs. Mismatches here would PWA-install with broken jump targets.
      { name: "Find", url: "/guide", short_name: "Find" },
      { name: "Map", url: "/map", short_name: "Map" },
      { name: "Events", url: "/events", short_name: "Events" },
      { name: "My Radius", url: "/my-radius", short_name: "My Radius" },
    ],
  };
}
