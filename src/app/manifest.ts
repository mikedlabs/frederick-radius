import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frederick Radius",
    short_name: "Radius",
    description: "A smarter way to experience Frederick County.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    lang: "en-US",
    categories: ["lifestyle", "navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      // URLs match start_url ("/today") and the four primary BottomNav
      // tabs. Mismatches here would PWA-install with broken jump targets.
      { name: "Today", url: "/today", short_name: "Today" },
      { name: "Map", url: "/map", short_name: "Map" },
      { name: "Events", url: "/events", short_name: "Events" },
      { name: "Radius", url: "/radius", short_name: "Radius" },
    ],
  };
}
