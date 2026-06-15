import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frederick Radius",
    short_name: "Radius",
    description: "A better way to use Frederick County.",
    start_url: "/today",
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
      // start_url is "/today" (the answer surface); these jump targets are
      // the other primary BottomNav tabs. The Find (/guide) shortcut was
      // dropped when /guide lost its tab — /today + search cover that intent.
      { name: "Map", url: "/map", short_name: "Map" },
      { name: "Events", url: "/events", short_name: "Events" },
      { name: "Saved", url: "/my-radius", short_name: "Saved" },
    ],
  };
}
