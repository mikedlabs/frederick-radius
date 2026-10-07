import { mapboxRequestRuntimeEnabled } from "@/lib/mapbox-budget";

/**
 * Which picture the place and event mini maps draw.
 *
 * - `static-image`: one CDN-cached Mapbox Static Images PNG through
 *   /api/static-map. Paid per uncached request, so it is chosen only when its
 *   runtime switch, a nonzero daily cap, and the dedicated server token are
 *   all present. The default configuration can never issue that request.
 * - `owned-basemap`: the self-hosted county PMTiles basemap drawn by MapLibre
 *   (docs/MAPLIBRE_SURFACES.md). No token and no per-load billing.
 *
 * Server-only in practice: it reads process.env, so client code receives the
 * decision as rendered markup rather than calling this.
 */
export type MiniMapSource = "static-image" | "owned-basemap";

export function miniMapSource(): MiniMapSource {
  return mapboxRequestRuntimeEnabled("static") &&
    Boolean(process.env.MAPBOX_SERVER_TOKEN?.trim())
    ? "static-image"
    : "owned-basemap";
}

/**
 * One camera for the preview and its handoff. The mini map shows the block
 * around the pin, and "Open map" lands on that same framing on /map.
 */
export const MINI_MAP_ZOOM = 15.5;
