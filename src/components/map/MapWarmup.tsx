"use client";

import { useEffect } from "react";
import { warmMapPlaces } from "./mapPlacesClient";

/**
 * MapWarmup — start downloading the heavy map chunk and committed place
 * snapshot from the static shell.
 *
 * This component mounts outside the Suspense boundary, so the two core
 * browser requests overlap hydration. Provider-backed context deliberately
 * starts later, from BrowseMapClient, and can never delay this path.
 *
 * Renders nothing; the import result is intentionally discarded.
 */
export default function MapWarmup() {
  useEffect(() => {
    void import("./AppMap");
    warmMapPlaces();
  }, []);
  return null;
}
