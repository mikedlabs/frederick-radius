"use client";

import { useEffect, useState } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import provenance from "../../../public/data/fair/aerial/provenance.json";

export const FAIR_AERIAL_URL = "/data/fair/aerial/frederick-fairgrounds-2025.jpg";
export const FAIR_AERIAL_ATTRIBUTION = 'Aerial: <a href="https://www.arcgis.com/home/item.html?id=7ff8fee809dd4afcab7fbea0916e4ebe" title="2025 aerial from the State of Maryland, MD iMAP, DoIT" target="_blank" rel="noopener noreferrer">MD iMAP</a>';
export type FairAerialStatus = "loading" | "ready" | "unavailable";

/** The clear map remains usable while the optional photograph loads. */
export function useFairAerialStatus(enabled: boolean): FairAerialStatus {
  const [status, setStatus] = useState<FairAerialStatus>("loading");
  useEffect(() => {
    if (!enabled) return;
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      setStatus("unavailable");
    }, 10_000);
    image.onload = () => {
      window.clearTimeout(timeout);
      setStatus(image.naturalWidth > 0 ? "ready" : "unavailable");
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      setStatus("unavailable");
    };
    image.src = FAIR_AERIAL_URL;
    return () => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
    };
  }, [enabled]);
  return status;
}

export default function FairAerialLayer({ beforeId }: { beforeId?: string }) {
  return (
    <Source
      id="fair-aerial-2025"
      type="image"
      url={FAIR_AERIAL_URL}
      coordinates={provenance.coordinates as [[number, number], [number, number], [number, number], [number, number]]}
    >
      <Layer
        id="fair-aerial-photo"
        type="raster"
        beforeId={beforeId}
        paint={{ "raster-fade-duration": 0 }}
      />
    </Source>
  );
}
