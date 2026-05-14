import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frederick Radius",
    short_name: "Radius",
    description: "A smarter way to experience Frederick County.",
    start_url: "/app/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FAFAF7",
    theme_color: "#C4451C",
    lang: "en-US",
    categories: ["lifestyle", "navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      { name: "Today", url: "/app/today", short_name: "Today" },
      { name: "Map", url: "/app/map", short_name: "Map" },
      { name: "Events", url: "/app/events", short_name: "Events" },
      { name: "Radius", url: "/app/radius", short_name: "Radius" },
    ],
  };
}
