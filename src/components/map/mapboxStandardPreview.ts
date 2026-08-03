import type { Map as GLMap } from "mapbox-gl";

/**
 * Mapbox Standard is deliberately a preview path, not the public default.
 *
 * The proven Frederick map still uses light-v11 plus its custom runtime/baked
 * palette. To evaluate Standard without changing that contract, set:
 *
 *   NEXT_PUBLIC_MAPBOX_STANDARD_PREVIEW=query
 *
 * on an owner preview deployment and open `/map?basemap=standard`.
 * Setting the value to `1` enables Standard for the whole preview deployment.
 * Any other value (including an unset variable) keeps the existing basemap.
 */
export const MAPBOX_STANDARD_STYLE_URL = "mapbox://styles/mapbox/standard";
export const MAPBOX_STANDARD_PREVIEW_PARAM = "basemap";

export type MapboxStandardPreviewMode = "off" | "query" | "all";
export type PreviewSearch = string | URLSearchParams | null | undefined;

export function mapboxStandardPreviewMode(
  raw = process.env.NEXT_PUBLIC_MAPBOX_STANDARD_PREVIEW,
): MapboxStandardPreviewMode {
  const value = raw?.trim().toLowerCase();
  if (value === "query") return "query";
  if (
    value === "1" ||
    value === "true" ||
    value === "all" ||
    value === "standard"
  ) {
    return "all";
  }
  return "off";
}

function previewParams(search: PreviewSearch): URLSearchParams {
  if (search instanceof URLSearchParams) return search;
  return new URLSearchParams(
    typeof search === "string" && search.startsWith("?")
      ? search.slice(1)
      : search ?? "",
  );
}

export function isMapboxStandardPreviewEnabled(
  search?: PreviewSearch,
  envValue = process.env.NEXT_PUBLIC_MAPBOX_STANDARD_PREVIEW,
): boolean {
  const mode = mapboxStandardPreviewMode(envValue);
  if (mode === "all") return true;
  if (mode === "off") return false;
  return (
    previewParams(search)
      .get(MAPBOX_STANDARD_PREVIEW_PARAM)
      ?.trim()
      .toLowerCase() === "standard"
  );
}

/**
 * Selects Standard only when the explicit preview gate is open. Keeping this
 * choice in one function makes it difficult for a future refactor to
 * accidentally turn an owner experiment into the production default.
 */
export function mapStyleWithStandardPreview<T>(
  currentStyle: T,
  search?: PreviewSearch,
  envValue = process.env.NEXT_PUBLIC_MAPBOX_STANDARD_PREVIEW,
): T | typeof MAPBOX_STANDARD_STYLE_URL {
  return isMapboxStandardPreviewEnabled(search, envValue)
    ? MAPBOX_STANDARD_STYLE_URL
    : currentStyle;
}

/**
 * Config supported by the installed Mapbox GL JS 3.27.x.
 *
 * It preserves the Frederick paper/creek/forest palette and suppresses
 * Mapbox's generic POI + transit labels because Radius supplies its own
 * curated places and live transit layer. Place and road labels remain for
 * wayfinding. The restrained 3D settings let an owner evaluate Standard's
 * depth without allowing trees/facades to compete with Radius overlays.
 */
export const FREDERICK_STANDARD_CONFIG = Object.freeze({
  theme: "faded",
  lightPreset: "day",
  showPlaceLabels: true,
  showRoadLabels: true,
  showPedestrianRoads: true,
  showPointOfInterestLabels: false,
  showTransitLabels: false,
  showAdminBoundaries: true,
  show3dBuildings: true,
  show3dLandmarks: true,
  show3dTrees: false,
  show3dFacades: false,
  colorLand: "#F2EFE8",
  colorWater: "#86AFC4",
  colorGreenspace: "#B9CDAE",
  colorBuildings: "#DDD5C7",
  colorRoads: "#CFC7B9",
  colorTrunks: "#BEB3A1",
  colorMotorways: "#9D8D73",
  colorPlaceLabels: "#201C17",
  colorRoadLabels: "#555850",
  colorAdminBoundaries: "#9E886A",
});

export type FrederickStandardConfig = Readonly<
  Record<string, string | number | boolean>
>;

type ConfigurableMap = Pick<GLMap, "setConfigProperty">;

export type StandardPreviewConfigResult = {
  enabled: boolean;
  applied: string[];
  skipped: string[];
};

/**
 * Applies Standard's `basemap` import configuration only when the preview gate
 * is enabled. Every property is isolated so a Mapbox style/schema change can
 * skip one option without breaking the map or the remaining configuration.
 */
export function applyMapboxStandardPreviewConfig(
  map: ConfigurableMap | null | undefined,
  options: {
    search?: PreviewSearch;
    envValue?: string;
    config?: FrederickStandardConfig;
  } = {},
): StandardPreviewConfigResult {
  const enabled = isMapboxStandardPreviewEnabled(
    options.search,
    options.envValue,
  );
  const config = options.config ?? FREDERICK_STANDARD_CONFIG;
  const keys = Object.keys(config);

  if (!enabled || !map || typeof map.setConfigProperty !== "function") {
    return { enabled, applied: [], skipped: enabled ? keys : [] };
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const [property, value] of Object.entries(config)) {
    try {
      map.setConfigProperty("basemap", property, value);
      applied.push(property);
    } catch {
      skipped.push(property);
    }
  }

  return { enabled, applied, skipped };
}
