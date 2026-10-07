"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MapCanvas from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { hasWebGL } from "@/components/map/mapCameraHelpers";
import { isFatalMapboxError } from "@/components/map/mapboxFailure";
import { useFrederickFlavorStyle } from "@/components/map/useFrederickFlavorStyle";
import { COUNTY_OVERVIEW_BOUNDS } from "@/components/map/countyOverview";
import { prefersReducedMotion } from "@/lib/motion";

export type CountyOverviewMapStatus = "ready" | "unavailable";

/**
 * The MapLibre half of CountyOverviewMap: the self-hosted county basemap,
 * still, fitted to COUNTY_OVERVIEW_BOUNDS with no padding so it lines up with
 * the overlay the parent draws in the same square frame.
 *
 * The basemap's own symbol layers (place names, road shields) are dropped.
 * The overview labels its towns and parks itself, and a second "Frederick"
 * printed by the basemap beside the overlay's label would read as two places.
 *
 * Like OwnedMiniMapCanvas it is non-interactive: no wheel, drag or touch
 * handlers, so a finger moving over it scrolls the page, and the canvas
 * leaves the tab order. Status goes up so the parent keeps its Cream
 * placeholder until the first complete frame.
 */
export default function CountyOverviewMapCanvas({
  onStatus,
}: {
  onStatus: (status: CountyOverviewMapStatus) => void;
}) {
  const [webgl] = useState(hasWebGL);
  const [reducedMotion] = useState(prefersReducedMotion);
  const loadedRef = useRef(false);
  const baseStyle = useFrederickFlavorStyle();
  const mapStyle = useMemo(
    () => ({
      ...baseStyle,
      layers: baseStyle.layers.filter((layer) => layer.type !== "symbol"),
    }),
    [baseStyle],
  );

  useEffect(() => {
    if (!webgl) onStatus("unavailable");
  }, [webgl, onStatus]);

  if (!webgl) return null;

  return (
    <MapCanvas
      initialViewState={{
        bounds: COUNTY_OVERVIEW_BOUNDS,
        fitBoundsOptions: { padding: 0 },
      }}
      mapStyle={mapStyle}
      style={{ position: "absolute", inset: 0 }}
      interactive={false}
      // The parent prints the credits as plain text; MapLibre's control is a
      // set of links and the overview can sit inside a link.
      attributionControl={false}
      fadeDuration={reducedMotion ? 0 : 300}
      onLoad={() => {
        loadedRef.current = true;
        onStatus("ready");
      }}
      onError={(event) => {
        const message = String(event?.error?.message ?? "").toLowerCase();
        if (isFatalMapboxError(message, loadedRef.current)) {
          onStatus("unavailable");
        }
      }}
    />
  );
}
