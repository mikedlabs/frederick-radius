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
const PAPER = "#F4EFE6"; // --app-paper: land background
const PAPER_2 = "#ECE5D5"; // --app-paper-2: subtle lift for landuse
const WATER = "#7FA4BB"; // soft Carroll Creek slate (lighter than --app-cool for light bg)
const WATER_LINE = "#5C8AA8"; // stronger creek/river lines, --app-cool-2 family
const PARK = "#C9D6BB"; // sage-tinted park green (--app-sage at 60% over paper)
const BUILDING = "#DDD3BF"; // warm building card
const ROAD_MINOR = "#D9D2C3"; // --app-border hairline
const ROAD_MAJOR = "#C2B8A0"; // a step darker, warm road
const ROAD_HWY = "#A89A7C"; // warm taupe highway
const LABEL = "#1A1815"; // --app-ink: warm-dark primary label
const LABEL_2 = "#6A6862"; // --app-ink-3: secondary label
const HALO = "#F4EFE6"; // paper halo around dark text

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
function installRelief(map: GLMap): void {
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
            "hillshade-highlight-color": "#FBF8F1",
            "hillshade-accent-color": "#D9D2C3",
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

export function applyFrederickPalette(map: GLMap): void {
  const apply = () => {
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
        else if (has(id, "park", "green", "grass", "wood", "forest", "pitch", "cemetery"))
          set("fill-color", PARK);
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
        if (has(id, "motorway", "trunk")) set("line-color", ROAD_HWY);
        else if (has(id, "primary", "secondary", "main")) set("line-color", ROAD_MAJOR);
        else if (has(id, "road", "street", "bridge", "tunnel", "path", "rail", "transit"))
          set("line-color", ROAD_MINOR);
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
  };

  if (map.isStyleLoaded()) apply();
  else map.once("styledata", apply);
  // Mapbox loads/replaces the style asynchronously; reapply on each load.
  map.on("style.load", apply);
}
