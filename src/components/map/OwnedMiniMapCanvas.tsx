"use client";

import { useEffect, useRef, useState } from "react";
import MapCanvas from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { hasWebGL } from "@/components/map/mapCameraHelpers";
import { isFatalMapboxError } from "@/components/map/mapboxFailure";
import { useFrederickFlavorStyle } from "@/components/map/useFrederickFlavorStyle";
import { prefersReducedMotion } from "@/lib/motion";

export type OwnedMiniMapStatus = "ready" | "unavailable";

/**
 * The MapLibre half of OwnedMiniMap, split out so the engine chunk, worker,
 * and tiles are fetched only once a mini map nears the viewport.
 *
 * It draws a still picture of the block: `interactive={false}` attaches no
 * wheel, drag, or touch handlers, so a finger or trackpad moving over it
 * scrolls the page as if the map were an image, and a tap falls through to
 * the surrounding "Open map" link. The canvas also leaves the tab order.
 *
 * Status is reported upward instead of rendered here so the parent's Cream
 * placeholder stays on screen until the first complete frame, and stays as
 * the final state when this browser cannot draw the map.
 */
export default function OwnedMiniMapCanvas({
  lng,
  lat,
  zoom,
  onStatus,
}: {
  lng: number;
  lat: number;
  zoom: number;
  onStatus: (status: OwnedMiniMapStatus) => void;
}) {
  // This chunk only ever renders in the browser (ssr: false, behind a
  // viewport gate), so the capability probes can run on first render.
  const [webgl] = useState(hasWebGL);
  const [reducedMotion] = useState(prefersReducedMotion);
  const loadedRef = useRef(false);
  const mapStyle = useFrederickFlavorStyle();

  useEffect(() => {
    if (!webgl) onStatus("unavailable");
  }, [webgl, onStatus]);

  if (!webgl) return null;

  return (
    <MapCanvas
      initialViewState={{ longitude: lng, latitude: lat, zoom }}
      mapStyle={mapStyle}
      style={{ position: "absolute", inset: 0 }}
      interactive={false}
      // Attribution is drawn by the parent as plain text. MapLibre's control
      // is a set of links, and this canvas already sits inside one.
      attributionControl={false}
      // MapLibre's default 300ms label fade is motion; drop it on request.
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
