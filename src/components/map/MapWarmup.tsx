"use client";

import { useEffect } from "react";

/**
 * MapWarmup — start downloading the heavy map chunk while the server is
 * still streaming the data half of /map.
 *
 * The browse map is a serial chain: shell → (server waits on ~10 feeds
 * inside Suspense) → flight arrives → hydrate → next/dynamic fetches the
 * AppMap chunk (mapbox-gl, the app's biggest script) → style/tiles. This
 * component mounts from the SHELL, outside the Suspense boundary, so the
 * dynamic-import fetch overlaps the server wait instead of queuing behind
 * it. By the time BrowseMapArea streams in, the module is warm and the
 * dynamic() resolves from cache.
 *
 * Renders nothing; the import result is intentionally discarded.
 */
export default function MapWarmup() {
  useEffect(() => {
    void import("./AppMap");
  }, []);
  return null;
}
