/**
 * Repaint the Mapbox base style with the Frederick Radius brand.
 *
 * The base is Mapbox's stock light-v11. Rather than fork a style JSON
 * (brittle, and the real custom style is the owner-only Studio
 * workflow, P2-1), we walk the loaded layers and rewrite paint to
 * Brand Book No. 01: paper-cream land, hairline-tan roads, Carroll
 * Creek slate water, sage parks, warm-ink labels. POI label clutter
 * is suppressed so the app's own pins are the points of interest.
 *
 * All writes are guarded: a missing layer or unsupported property is
 * skipped, so this is safe across Mapbox style updates and never throws.
 */
import type { Map as GLMap } from "mapbox-gl";

// Brand Book No. 01 — paper-mode map tokens. Tracks the app palette
// (--app-paper, --app-cool, --app-sage, --app-ink, --app-border)
// but as literal hexes so we can pass them to Mapbox paint props
// (which don't resolve CSS variables).
// Aligned to the SHIPPED brand tokens (src/app/globals.css) so the map's
// ground reads as the same paper as the rest of the app, not a lighter
// off-match. Literal hexes because Mapbox paint props don't resolve CSS vars.
// These are the app's own tokens, copied exactly rather than approximated.
// The ground used to be #F2EFE8 against an app paper of #F4EEE2: a cooler,
// greyer cream that never quite matched the chrome sitting on top of it.
const PAPER = "#F4EEE2"; // --app-paper / --app-bg (Cream)
const PAPER_2 = "#EAE1D1"; // --app-paper-2
// Creek, lightened onto paper rather than a stock Mapbox blue.
const WATER = "#7FA6BA";
const WATER_LINE = "#396F8A";
// Catoctin Forest carried down to a fill weight. The old #B9CDAE was a
// generic yellow-sage with no relationship to the brand's green.
const PARK = "#C6D2C0";
const FARM = "#E2DAC0";
const BUILDING = "#E4DBCB";
const BUILDING_LINE = "#D3C9B7";
const BARE = "#EBE3D4";
// The road ladder is deliberately quiet. It covers more of the screen than
// anything else, and the brand guide asks the basemap to sit UNDER the
// app's pins and live layers rather than compete with them. Lightened about
// one step each; the casing keeps enough edge that roads still read as
// printed ribbons instead of dissolving into the paper.
const ROAD_MINOR = "#E0D6C4";
const ROAD_MAJOR = "#D2C7B2";
const ROAD_HWY = "#B5A68C";
const ROAD_CASE = "#C4B8A2";
const ROAD_HWY_CASE = "#8C7D66";
const BOUNDARY = "#A89272";
const LABEL = "#221C15"; // --app-ink
const LABEL_2 = "#5A5348"; // --app-ink-2
const HALO = "#F4EEE2";

const has = (id: string, ...needles: string[]) =>
  needles.some((n) => id.includes(n));

/**
 * Frederick County IS its terrain — the Catoctin and South Mountain
 * ridges wrapped around the Monocacy valley. A flat dark grid throws
 * that away and reads as anyone's map. A subtle, System-Black-tuned
 * hillshade makes the relief register as faint warm light on the
 * ridges without turning it into a topo map or costing legibility.
 * Idempotent: the style reloads on nav, so guard the source/layer.
 */
export function installRelief(map: GLMap): void {
  try {
    if (!map.getSource("fr-dem")) {
      map.addSource("fr-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
    }
    if (!map.getLayer("fr-hillshade")) {
      // Sit relief above land/landuse fills but below roads + labels so
      // wayfinding stays crisp. Anchor to the first road/bridge/symbol.
      const layers = map.getStyle()?.layers ?? [];
      const beforeId = layers.find(
        (l) =>
          l.type === "symbol" ||
          /road|bridge|tunnel|street/.test(l.id),
      )?.id;
      map.addLayer(
        {
          id: "fr-hillshade",
          type: "hillshade",
          source: "fr-dem",
          paint: {
            // Paper-mode hillshade: warm taupe shadow on the ridges,
            // paper-cream highlight on the sunny side. Subtle enough
            // that the relief reads as topographic texture, never as
            // dark blotches on the cream ground.
            "hillshade-shadow-color": "#B4A998",
            "hillshade-highlight-color": "#F1E9D7",
            "hillshade-accent-color": "#DACEB3",
            "hillshade-exaggeration": 0.3,
            "hillshade-illumination-direction": 315,
          },
        },
        beforeId,
      );
    }
  } catch {
    /* DEM unavailable on this token/style — degrade silently to flat */
  }
}

/**
 * Recolor a stock Mapbox style to the Frederick paper-cream palette at runtime.
 *
 * This walks every layer of the loaded style and mutates paint/layout — real
 * main-thread work on load. It runs ONCE per style load now (the previous
 * version registered BOTH `once("styledata")` and a standing `on("style.load")`,
 * so a Next route remount re-walked all ~92 layers twice). Returns a disposer
 * that removes the pending listener if the map unmounts before the style loads.
 * The pass is bracketed with performance marks so its cost is measurable (and
 * regressions catchable) — the plan is to retire this whole pass in favor of a
 * baked Mapbox Studio style, and the "fr-palette" measure will prove the win.
 */
export function applyFrederickPalette(map: GLMap): () => void {
  const apply = () => {
    const canMark = typeof performance !== "undefined" && typeof performance.mark === "function";
    if (canMark) performance.mark("fr-palette-start");
    const style = map.getStyle();
    if (!style?.layers) return;
    installRelief(map);

    for (const layer of style.layers) {
      const id = layer.id;
      const set = (prop: string, val: unknown) => {
        try {
          map.setPaintProperty(id, prop as never, val as never);
        } catch {
          /* layer lacks this property; skip */
        }
      };
      const setLayout = (prop: string, val: unknown) => {
        try {
          map.setLayoutProperty(id, prop as never, val as never);
        } catch {
          /* skip */
        }
      };

      if (layer.type === "background") {
        set("background-color", PAPER);
        continue;
      }

      if (layer.type === "fill") {
        if (has(id, "water")) set("fill-color", WATER);
        else if (has(id, "farmland", "orchard", "vineyard", "agricult"))
          // Frederick's working farmland reads as warm hay, not forest green.
          set("fill-color", FARM);
        else if (
          has(
            id,
            "park", "green", "grass", "wood", "forest", "pitch", "cemetery",
            "wetland", "scrub", "heath", "golf", "recreation", "national-park", "meadow",
          )
        )
          set("fill-color", PARK);
        else if (has(id, "sand", "beach", "rock", "quarry", "bare-ground"))
          set("fill-color", BARE);
        else if (has(id, "building")) {
          set("fill-color", BUILDING);
          set("fill-opacity", 0.7);
        } else if (has(id, "landuse", "landcover", "land-structure"))
          set("fill-color", PAPER_2);
        else set("fill-color", PAPER);
        continue;
      }

      if (layer.type === "fill-extrusion") {
        set("fill-extrusion-color", BUILDING);
        set("fill-extrusion-opacity", 0.55);
        continue;
      }

      if (layer.type === "line") {
        if (has(id, "water", "waterway", "river", "canal", "stream")) {
          // The Monocacy and Carroll Creek are the county's spine —
          // give them a confident, zoom-scaled presence instead of a
          // default hairline, in Carroll Creek slate that reads
          // against the paper-cream ground.
          set("line-color", WATER_LINE);
          set("line-opacity", 0.9);
          set("line-width", [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, 1.2,
            12, 2.6,
            16, 5,
          ]);
          continue;
        }
        if (has(id, "admin", "boundary")) {
          // County + municipal edges: a muted warm line so a reader can
          // place a town without a hard black rule cutting the paper.
          set("line-color", BOUNDARY);
          set("line-opacity", 0.55);
          continue;
        }
        if (has(id, "building")) {
          set("line-color", BUILDING_LINE);
          set("line-opacity", 0.6);
          continue;
        }
        // Casing layers ("road-…-case") get a warmer, darker edge than the
        // fill so roads read as printed ribbons, never white/blue seams.
        const isCase = has(id, "case", "casing", "outline");
        if (has(id, "motorway", "trunk"))
          set("line-color", isCase ? ROAD_HWY_CASE : ROAD_HWY);
        else if (has(id, "primary", "secondary", "main"))
          set("line-color", isCase ? ROAD_CASE : ROAD_MAJOR);
        else if (has(id, "road", "street", "bridge", "tunnel", "path", "rail", "transit"))
          set("line-color", isCase ? ROAD_CASE : ROAD_MINOR);
        else set("line-color", ROAD_MINOR);
        continue;
      }

      if (layer.type === "symbol") {
        // Suppress POI / transit-stop label clutter: the app's own pins
        // are the points of interest. Keep place and road wayfinding.
        if (has(id, "poi", "transit", "rail-label", "airport")) {
          setLayout("visibility", "none");
          continue;
        }
        const primary = has(id, "settlement", "place", "state", "country", "country-label");
        set("text-color", primary ? LABEL : LABEL_2);
        // Paper halo around warm-ink text — gives small road labels
        // and town names a soft printed-paper outline so they hold
        // up against the topographic hillshade behind them.
        set("text-halo-color", HALO);
        set("text-halo-width", 1.2);
        if (has(id, "water-point", "water-line", "natural"))
          set("text-color", LABEL_2);
      }
    }
    if (canMark) {
      performance.mark("fr-palette-end");
      try {
        performance.measure("fr-palette", "fr-palette-start", "fr-palette-end");
      } catch {
        /* marks missing (SSR/edge) — ignore */
      }
    }
  };

  if (map.isStyleLoaded()) {
    apply();
    return () => {};
  }
  // Single deferred pass on the first full style load. No standing style.load
  // listener: nothing swaps the style at runtime today, and the double-listener
  // made the layer walk run twice on every navigation.
  map.once("style.load", apply);
  return () => {
    try {
      map.off("style.load", apply);
    } catch {
      /* already fired / map torn down */
    }
  };
}
