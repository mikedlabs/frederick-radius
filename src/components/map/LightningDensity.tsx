"use client";

import { useEffect, useState } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { FREDERICK_COUNTY_BOUNDS } from "./constants";

type LightningLayerState =
  | { status: "idle" | "loading" | "unavailable" }
  | {
      status: "ready";
      imageUrl: string;
      frameAt: string;
    };

/**
 * NOAA's county-bounded, 15-minute lightning-density image.
 *
 * It appears with the existing Weather/Radar choice rather than adding a new
 * map button. This is density at 8 km resolution, not individual strike pins,
 * and the component never labels it otherwise.
 */
export default function LightningDensity({
  show,
  beforeId,
}: {
  show: boolean;
  beforeId?: string;
}) {
  const [state, setState] = useState<LightningLayerState>({
    status: "loading",
  });

  useEffect(() => {
    if (!show) return;
    const controller = new AbortController();
    fetch("/api/weather/lightning", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        const value =
          payload && typeof payload === "object"
            ? payload as Record<string, unknown>
            : null;
        if (
          value?.available === true &&
          typeof value.imageUrl === "string" &&
          typeof value.frameAt === "string"
        ) {
          setState({
            status: "ready",
            imageUrl: value.imageUrl,
            frameAt: value.frameAt,
          });
        } else {
          setState({ status: "unavailable" });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "unavailable" });
      });
    return () => controller.abort();
  }, [show]);

  if (!show || state.status !== "ready") return null;
  const [[west, south], [east, north]] = FREDERICK_COUNTY_BOUNDS;

  return (
    <Source
      id="noaa-lightning-density"
      type="image"
      url={state.imageUrl}
      coordinates={[
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ]}
    >
      <Layer
        id="noaa-lightning-density-layer"
        type="raster"
        beforeId={beforeId}
        paint={{
          "raster-opacity": 0.58,
          "raster-fade-duration": 300,
          "raster-resampling": "linear",
        }}
      />
    </Source>
  );
}
