/**
 * Recolor the OpenFreeMap "Positron" base style with the Frederick Radius
 * palette. Called on map.load() — walks the existing layers and rewrites
 * paint properties to match the app's warm civic tones.
 *
 * Why runtime overrides instead of a custom JSON: Positron has dozens of
 * carefully-balanced layers (roads by class, water variants, building
 * heights). Forking the whole JSON is brittle; overriding fill/line/text
 * paint is surgical and stays compatible if OpenFreeMap updates its style.
 */
import type { Map as GLMap } from "mapbox-gl";

// Frederick palette tokens
const PAPER = "#FAFAF7";
const PAPER_SUNKEN = "#F2F1EC";
const PAPER_WARM = "#EAE3D3";       // soft warm cream for roads
const PAPER_WARMER = "#E2D6BD";     // major roads / highways tint
const WATER = "#C4DBE8";            // living civic blue
const PARK = "#CDE3C2";             // living sage for parks
const BUILDING = "#ECE6D8";         // warm cream for buildings
const INK = "#1A1A1A";
const INK_2 = "#4A4A48";
const INK_3 = "#8B7E68";            // warm brown-grey for labels
const ROAD_OUTLINE = "#C8BFA9";     // road outlines

const PAINT_OVERRIDES: Record<string, Record<string, unknown>> = {
  background: { "background-color": PAPER },
  water: { "fill-color": WATER },
  // Park / green spaces
  landuse_park: { "fill-color": PARK },
  landuse_recreation_ground: { "fill-color": PARK },
  landuse_cemetery: { "fill-color": PARK },
  park: { "fill-color": PARK },
  park_outline: { "line-color": "#B5C9AC", "line-width": 0.5 },
  // Buildings
  building: { "fill-color": BUILDING, "fill-opacity": 0.85 },
  // Roads — by class (Positron uses common layer ids)
  road_motorway_casing: { "line-color": ROAD_OUTLINE, "line-opacity": 0.4 },
  road_motorway: { "line-color": PAPER_WARMER },
  road_trunk_casing: { "line-color": ROAD_OUTLINE, "line-opacity": 0.4 },
  road_trunk: { "line-color": PAPER_WARMER },
  road_primary_casing: { "line-color": ROAD_OUTLINE, "line-opacity": 0.35 },
  road_primary: { "line-color": PAPER_WARM },
  road_secondary_casing: { "line-color": ROAD_OUTLINE, "line-opacity": 0.3 },
  road_secondary: { "line-color": PAPER_WARM },
  road_tertiary_casing: { "line-color": ROAD_OUTLINE, "line-opacity": 0.25 },
  road_tertiary: { "line-color": PAPER_SUNKEN },
  road_minor_casing: { "line-color": ROAD_OUTLINE, "line-opacity": 0.18 },
  road_minor: { "line-color": PAPER_SUNKEN },
  road_path: { "line-color": "#C8C0A8" },
  road_service: { "line-color": PAPER_SUNKEN },
  // Generic catchalls
  landcover_grass: { "fill-color": PARK, "fill-opacity": 0.6 },
  landcover_wood: { "fill-color": "#BFD4B4", "fill-opacity": 0.75 },
};

const TEXT_OVERRIDES: Record<string, Record<string, unknown>> = {
  // Labels — keep them subtle warm grey
  place_country: { "text-color": INK },
  place_state: { "text-color": INK },
  place_city: { "text-color": INK, "text-halo-color": PAPER, "text-halo-width": 2 },
  place_town: { "text-color": INK_2, "text-halo-color": PAPER, "text-halo-width": 1.5 },
  place_village: { "text-color": INK_2, "text-halo-color": PAPER, "text-halo-width": 1.5 },
  place_other: { "text-color": INK_3, "text-halo-color": PAPER, "text-halo-width": 1.5 },
  poi_label: { "text-color": INK_3, "text-halo-color": PAPER, "text-halo-width": 1.5 },
  // Roads
  road_label: { "text-color": INK_2, "text-halo-color": PAPER, "text-halo-width": 1.5 },
  road_oneway: { "text-color": INK_3, "text-halo-color": PAPER, "text-halo-width": 1 },
};

export function applyFrederickPalette(map: GLMap): void {
  // Mutating layers can throw if the style hasn't finished parsing.
  // Listen for "styledata" instead of "load" for safety.
  const apply = () => {
    const style = map.getStyle();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      const id = layer.id;
      // Try exact-match overrides first
      const paint = PAINT_OVERRIDES[id];
      if (paint) {
        for (const [k, v] of Object.entries(paint)) {
          try { map.setPaintProperty(id, k as never, v as never); } catch { /* layer may not support this property */ }
        }
      }
      const text = TEXT_OVERRIDES[id];
      if (text) {
        for (const [k, v] of Object.entries(text)) {
          try { map.setPaintProperty(id, k as never, v as never); } catch { /* not all symbol layers have text-color */ }
        }
      }
      // Loose-match: any layer whose id starts with "road_" but not in overrides → soft minor road tint
      if (
        !PAINT_OVERRIDES[id] &&
        layer.type === "line" &&
        /^(road|tunnel|bridge)_/i.test(id) &&
        !/_label$/.test(id)
      ) {
        try { map.setPaintProperty(id, "line-color", PAPER_SUNKEN); } catch {}
      }
    }
  };

  if (map.isStyleLoaded()) {
    apply();
  } else {
    map.once("styledata", apply);
  }
}
