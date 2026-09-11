"use client";

import { useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import {
  buildFrederickFlavorStyle,
  ensureMapLibreWorker,
} from "@/lib/map/frederickFlavorStyle";

/**
 * Everything a MapLibre surface must do before its first map exists.
 *
 * Three separate footguns, each of which fails silently rather than
 * loudly, which is why they live in one place instead of being repeated
 * per surface:
 *
 * 1. The worker URL. MapLibre v6 boots its tile worker from
 *    `new Worker(new URL(...))` relative to its own module, Turbopack does
 *    not rewrite that, and the worker is constructed with an empty URL and
 *    dies. Tile fetching lives in the worker, so the map paints its
 *    background colour and simply stops, with no error event.
 * 2. The pmtiles protocol. Without it the county archive URL is just an
 *    unrecognised scheme and the source never loads.
 * 3. Both are global registrations, so doing them per-map instance is
 *    wasteful and, for addProtocol, order-dependent.
 *
 * The hook itself is safe to render on the server: it skips the global
 * registrations there and builds the style against an empty origin, which
 * yields root-relative asset URLs nothing ever fetches, because no map
 * exists server-side. That matters because not every surface mounts behind
 * `ssr: false` — /map?mode=radius renders AppMap on the server first, and
 * reading `window.location` during render turned that into a "window is not
 * defined" bailout to client rendering.
 */
let installed = false;

/**
 * Both registrations are process-global and must OUTLIVE any one map. An
 * earlier version of the admin bench paired addProtocol with a
 * removeProtocol on unmount, which is correct in isolation and wrong in a
 * single-page app: leaving the bench tore the pmtiles handler out from
 * under every other surface, and the next map to mount got a style whose
 * source URL used a scheme nobody had registered. Register once, never
 * unregister.
 */
export function installFrederickMapLibreGlobals(origin: string): void {
  if (installed) return;
  ensureMapLibreWorker(maplibregl, origin);
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  installed = true;
}

export function useFrederickFlavorStyle({ pois = false }: { pois?: boolean } = {}) {
  return useMemo(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    if (origin) installFrederickMapLibreGlobals(origin);
    return buildFrederickFlavorStyle(origin, { pois });
  }, [pois]);
}
