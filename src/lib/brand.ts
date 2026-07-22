/**
 * Frederick Radius - canonical brand contract.
 *
 * Product UI, exported artwork, PWA chrome, and social cards should read from
 * this vocabulary rather than retyping colors or redrawing the Ripple. CSS
 * variables mirror these values in app/globals.css because CSS cannot import
 * TypeScript at runtime.
 */
export const BRAND = {
  name: "Frederick Radius",
  tagline: "Frederick County starts where you are.",
  description:
    "Current local information for Frederick County, organized around where you are.",
  domain: "frederickradius.app",
  system: "Frederick Radius Brand System",
  version: "1.2",
  updated: "2026-07-22",
  colors: {
    brick: "#B5462B",
    cream: "#F4EEE2",
    ink: "#221C15",
    forest: "#315A43",
    creek: "#285D73",
    plum: "#7E2C6F",
    amber: "#C58A32",
    ridge: "#3F5E8F",
    surface: "#FBF8F0",
    paperDeep: "#EAE1D1",
    border: "#D8CDBA",
    mutedInk: "#6C6357",
    controlBorder: "#927F63",
    functionalAmber: "#925E16",
  },
  type: {
    display: "Libre Caslon Display",
    text: "Public Sans",
    textRuntime: "Public Sans Variable",
  },
} as const;

export const RIPPLE_GEOMETRY = {
  full: {
    baseline: 78,
    paths: [
      "M31 78 A 19 19 0 0 1 69 78",
      "M15 78 A 35 35 0 0 1 85 78",
      "M4 78 A 46 46 0 0 1 96 78",
    ],
    opacities: [1, 1, 1],
    strokeWidth: 4,
    dotRadius: 8,
    // The Ripple's arcs rise from the dot, so its geometric frame is not its
    // visual frame. This shared optical correction keeps the mark centered in
    // the header, app tile, favicon, and exported artwork without redrawing
    // the symbol differently on every surface.
    opticalOffsetY: -8,
  },
  compact: {
    baseline: 76,
    paths: [
      "M29 76 A 21 21 0 0 1 71 76",
      "M11 76 A 39 39 0 0 1 89 76",
    ],
    opacities: [1, 1],
    strokeWidth: 5,
    dotRadius: 9.5,
    opticalOffsetY: -10,
  },
  favicon: {
    baseline: 74,
    paths: ["M27 74 A 23 23 0 0 1 73 74"],
    opacities: [1],
    strokeWidth: 7,
    dotRadius: 11,
    opticalOffsetY: -16,
  },
  squircle:
    "M0 23.33 C0 7.5 7.5 0 23.33 0 H76.67 C92.5 0 100 7.5 100 23.33 V76.67 C100 92.5 92.5 100 76.67 100 H23.33 C7.5 100 0 92.5 0 76.67 Z",
} as const;

export type RippleDetail = keyof Pick<typeof RIPPLE_GEOMETRY, "full" | "compact" | "favicon">;

export function rippleDetailForSize(size: number): RippleDetail {
  if (size >= 48) return "full";
  if (size >= 24) return "compact";
  return "favicon";
}
