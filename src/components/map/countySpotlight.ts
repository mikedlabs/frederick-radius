/**
 * "Lock the map into Frederick County."
 *
 * Veils everything OUTSIDE the county line in warm paper and traces the
 * border, so the map reads as a field-guide plate of one place — not a
 * slice of an endless world map. The county glows; the rest recedes.
 *
 * The boundary is the U.S. Census Bureau TIGERweb county outline for
 * GEOID 24021, committed as static data so there is no runtime dependency.
 * The display copy is simplified to a precision appropriate for this
 * field-guide frame; it is not survey geometry.
 *
 * Two layers, both added beneath the app's own pins (which mount via
 * react-map-gl after load), so places and the radius reach always sit
 * on top of the veil:
 *   - fr-county-veil : world box MINUS the county → a paper scrim over
 *                      everything beyond the line.
 *   - fr-county-line : the border itself, a warm field-guide hairline.
 *
 * All writes are guarded and idempotent; the style reloads on nav, so we
 * reapply on style.load.
 */
import type { Map as GLMap } from "maplibre-gl";
import COUNTY from "@/data/county-boundary.json";
import { BRAND } from "@/lib/brand";

// Warm paper scrim (tracks --app-bg) and a field-guide border ink.
const VEIL = BRAND.colors.paperDeep;
const VEIL_OPACITY = 0.58;
const BORDER = BRAND.colors.controlBorder;
const BORDER_GLOW = BRAND.colors.brick;

// A box wide enough to cover any viewport the app shows (generous around
// Maryland). Wound as the veil's outer ring; the county rings punch holes.
const WORLD_BOX: [number, number][] = [
  [-80.5, 37.5],
  [-74.5, 37.5],
  [-74.5, 41.5],
  [-80.5, 41.5],
  [-80.5, 37.5],
];

type Ring = [number, number][];

/** Outer ring of every county polygon — each becomes a hole in the veil. */
function countyOuterRings(): Ring[] {
  const g = COUNTY as { type: string; coordinates: number[][][][] | number[][][] };
  if (g.type === "MultiPolygon") {
    return (g.coordinates as number[][][][]).map((poly) => poly[0] as Ring);
  }
  // Polygon
  return [(g.coordinates as number[][][])[0] as Ring];
}

function veilFeature(): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      // [ outer box, ...county rings as holes ] → fill is "everything
      // except inside the county."
      coordinates: [WORLD_BOX, ...countyOuterRings()],
    },
  };
}

function borderFeature(): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: COUNTY as GeoJSON.MultiPolygon | GeoJSON.Polygon,
  };
}

export function installCountySpotlight(map: GLMap): void {
  const apply = () => {
    try {
      if (!map.getSource("fr-county-veil-src")) {
        map.addSource("fr-county-veil-src", { type: "geojson", data: veilFeature() });
      }
      if (!map.getSource("fr-county-line-src")) {
        map.addSource("fr-county-line-src", { type: "geojson", data: borderFeature() });
      }
      if (!map.getLayer("fr-county-veil")) {
        map.addLayer({
          id: "fr-county-veil",
          type: "fill",
          source: "fr-county-veil-src",
          paint: {
            "fill-color": VEIL,
            // Ease the scrim back as you zoom into a neighborhood — at
            // street level the edge is far off-screen and the veil would
            // only flatten the view; at county scale it does its framing
            // work.
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9, VEIL_OPACITY,
              13, VEIL_OPACITY * 0.85,
              15, 0.4,
            ],
          },
        });
      }
      if (!map.getLayer("fr-county-line-glow")) {
        map.addLayer({
          id: "fr-county-line-glow",
          type: "line",
          source: "fr-county-line-src",
          layout: { "line-join": "round" },
          paint: {
            "line-color": BORDER_GLOW,
            "line-opacity": 0.25,
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 12, 6],
            "line-blur": 2,
          },
        });
      }
      if (!map.getLayer("fr-county-line")) {
        map.addLayer({
          id: "fr-county-line",
          type: "line",
          source: "fr-county-line-src",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": BORDER,
            "line-opacity": 0.85,
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 12, 1.8, 16, 2.4],
            // A fine field-guide dash — reads as a drawn border, not a road.
            "line-dasharray": [3, 1.6],
          },
        });
      }
    } catch {
      /* boundary or style unavailable — degrade to no spotlight */
    }
  };

  if (map.isStyleLoaded()) apply();
  else map.once("styledata", apply);
  map.on("style.load", apply);
}
