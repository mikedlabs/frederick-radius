import { layers } from "@protomaps/basemaps";
import type * as maplibregl from "maplibre-gl";
import { FREDERICK_FLAVOR } from "@/lib/map/frederickBasemapFlavor";

/**
 * The Frederick Radius basemap style, fully self-hosted (task #36).
 *
 * Tiles come from the county PMTiles extract in /public/basemap — a
 * 30 MB static file covering Frederick County plus a margin, zooms
 * 0–15, cut from the same Protomaps build the bench judged. Sprites
 * and glyphs still ride the /admin/basemap/assets relay until they are
 * vendored next to the tiles. No Mapbox token, no per-load billing,
 * no third-party fetch from the browser.
 *
 * Shared by the bench pane and the full-screen preview so the judged
 * style and the felt style can never drift apart.
 */
export const COUNTY_TILES_PATH = "/basemap/frederick-county.pmtiles";

export function buildFrederickFlavorStyle(
  origin: string,
): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: `${origin}/admin/basemap/assets/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/admin/basemap/assets/sprites/v4/light`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${origin}${COUNTY_TILES_PATH}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    // Cast bridges the duplicated @maplibre/maplibre-gl-style-spec package
    // (one copy under maplibre-gl, one under @protomaps/basemaps) —
    // identical spec, nominally distinct types.
    layers: layers("protomaps", FREDERICK_FLAVOR, {
      lang: "en",
    }) as unknown as maplibregl.LayerSpecification[],
  };
}
