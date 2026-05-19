/**
 * Repaint the base style in the Frederick Radius "Field Guide" v3
 * palette so the map reads as the same designed civic product as the
 * rest of the app, not a stock basemap. Rather than fork a style JSON
 * (brittle; the real custom style is the owner-only Studio workflow,
 * P2-1), we walk the loaded layers and rewrite paint to a warm light
 * field-guide cartography: warm almanac-paper land, dark warm ink
 * labels with a paper halo, civic-blue water, soft sage parks. POI
 * label clutter is suppressed so the app's own pins are the points of
 * interest.
 *
 * All writes are guarded: a missing layer or unsupported property is
 * skipped, so this is safe across base-style updates and never throws.
 */
import type { Map as GLMap } from "mapbox-gl";

// Field Guide v3 cartographic tokens (a warm LIGHT map — distinct
// from the app's #F7F4EC paper so the map reads as its own surface).
const INK0 = "#F0EBDD"; // warm field-guide paper: background, land
const SURFACE = "#EAE3D0"; // subtle lift for landuse
const WATER = "#B7D0DC"; // calm civic blue (Carroll Creek, Monocacy)
const PARK = "#D6DEC0"; // soft sage green
const BUILDING = "#E4DCC6"; // barely-there warm
const ROAD_MINOR = "#E3DBC6";
const ROAD_MAJOR = "#D6CDB2";
const ROAD_HWY = "#C7BB9A"; // warm, the only roads with any presence
const LABEL = "#2A2521"; // warm ink: primary labels
const LABEL_2 = "#7A7059"; // muted warm: secondary labels
const HALO = "#F2EEE3"; // paper halo so dark labels read on light land

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
            "hillshade-shadow-color": "#C9C0A6", // faint warm relief on paper
            "hillshade-highlight-color": "#FBF8EE",
            "hillshade-accent-color": "#D9D0B6",
            "hillshade-exaggeration": 0.32, // relief, not a topo map
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
        set("background-color", INK0);
        continue;
      }

      if (layer.type === "fill") {
        if (has(id, "water")) set("fill-color", WATER);
        else if (has(id, "park", "green", "grass", "wood", "forest", "pitch", "cemetery"))
          set("fill-color", PARK);
        else if (has(id, "building")) {
          set("fill-color", BUILDING);
          set("fill-opacity", 0.6);
        } else if (has(id, "landuse", "landcover", "land-structure"))
          set("fill-color", SURFACE);
        else set("fill-color", INK0);
        continue;
      }

      if (layer.type === "fill-extrusion") {
        set("fill-extrusion-color", BUILDING);
        set("fill-extrusion-opacity", 0.5);
        continue;
      }

      if (layer.type === "line") {
        if (has(id, "water", "waterway", "river", "canal", "stream")) {
          // The Monocacy and Carroll Creek are the county's spine —
          // give them a confident, zoom-scaled presence instead of a
          // default hairline, in the brand's lighter civic blue.
          set("line-color", "#5C92AC");
          set("line-opacity", 0.95);
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
        set("text-halo-color", HALO);
        set("text-halo-width", 1.1);
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
