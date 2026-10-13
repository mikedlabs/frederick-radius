import type { Map as GLMap, MapOptions } from "mapbox-gl";
import { BRAND } from "@/lib/brand";

/**
 * The main Radius, reach, and transit maps use Mapbox Standard again because
 * those are the product's immersive map surfaces. Small locator maps keep the
 * self-hosted MapLibre basemap so a place card never pays the premium-renderer
 * cost just to show one pin.
 */
export const MAPBOX_FIELD_GUIDE_STYLE = "mapbox://styles/mapbox/standard";

export const MAPBOX_LABEL_FONT_MEDIUM = [
  "DIN Pro Medium",
  "Arial Unicode MS Regular",
];
export const MAPBOX_LABEL_FONT_REGULAR = [
  "DIN Pro Regular",
  "Arial Unicode MS Regular",
];

/**
 * Mapbox Standard configuration is the basemap equivalent of the Radius
 * design tokens. The app supplies its own POIs, transit vehicles, events, and
 * utility pins, so stock POIs stay quiet while roads, towns, terrain, and 3D
 * buildings provide orientation and depth.
 */
export const MAPBOX_FIELD_GUIDE_CONFIG = {
  basemap: {
    theme: "faded",
    lightPreset: "day",
    font: "Source Sans Pro",
    showPedestrianRoads: true,
    showPlaceLabels: true,
    showRoadLabels: true,
    showPointOfInterestLabels: false,
    showTransitLabels: false,
    show3dObjects: true,
    show3dBuildings: true,
    show3dTrees: true,
    show3dLandmarks: true,
    showLandmarkIcons: false,
    showLandmarkIconLabels: false,
    showAdminBoundaries: true,
    colorLand: BRAND.colors.cream,
    colorWater: "#7FA6BA",
    colorGreenspace: "#C6D2C0",
    colorBuildings: BRAND.colors.border,
    colorRoads: BRAND.colors.paperDeep,
    colorTrunks: "#CBD7E6",
    colorMotorways: "#A8B9D0",
    colorPlaceLabels: BRAND.colors.ink,
    colorRoadLabels: BRAND.colors.mutedInk,
    colorAdminBoundaries: BRAND.colors.controlBorder,
  },
} as unknown as NonNullable<MapOptions["config"]>;

/** Reapply config when react-map-gl recycles an existing GL instance. */
export function applyMapboxFieldGuideConfig(map: GLMap): void {
  const config = MAPBOX_FIELD_GUIDE_CONFIG.basemap as Record<string, unknown>;
  for (const [property, value] of Object.entries(config)) {
    try {
      map.setConfigProperty("basemap", property, value);
    } catch {
      // A newly introduced option may not exist on an older cached renderer.
      // Keep the map usable and let supported properties continue to apply.
    }
  }
}
/**
 * Restore the geographic depth lost in the self-hosted flat-map migration.
 * Hillshade is always subtle; the DEM becomes real terrain only when an
 * intentional aerial/detail scene pitches the camera.
 */
export function installMapboxFieldGuideTerrain(map: GLMap): void {
  const hillshadeColors = {
    "hillshade-shadow-color": "#9AAAC0",
    "hillshade-highlight-color": BRAND.colors.cream,
    "hillshade-accent-color": "#CBD7E6",
  };
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
      map.addLayer({
        id: "fr-hillshade",
        type: "hillshade",
        source: "fr-dem",
        slot: "bottom",
        paint: {
          ...hillshadeColors,
          "hillshade-exaggeration": 0.28,
          "hillshade-illumination-direction": 315,
        },
      });
    } else {
      // A recycled map may already own the terrain layer. Refresh its colors
      // without recreating the DEM source, layer, or geographic depth.
      for (const property of Object.keys(hillshadeColors) as Array<keyof typeof hillshadeColors>) {
        map.setPaintProperty("fr-hillshade", property, hillshadeColors[property]);
      }
    }
  } catch {
    // Terrain is progressive enhancement. Search, pins, and routes still work
    // if a token or device cannot load the DEM.
  }
}
