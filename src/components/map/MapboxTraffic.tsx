"use client";

import { useEffect, useState } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import {
  MAPBOX_TRAFFIC_CLOSURE_FILTER,
  MAPBOX_TRAFFIC_CLOSURE_PAINT,
  MAPBOX_TRAFFIC_FLOW_FILTER,
  MAPBOX_TRAFFIC_FLOW_PAINT,
  MAPBOX_TRAFFIC_MIN_ZOOM,
  MAPBOX_TRAFFIC_SOURCE,
  MAPBOX_TRAFFIC_SOURCE_LAYER,
} from "./mapboxTrafficStyle";

const TRAFFIC_FADE_MS = 220;

/**
 * Current road speed is context, not the closure authority. Maryland CHART,
 * WZDx, and Radius's reviewed incident feeds remain the actionable sources.
 */
export default function MapboxTraffic({ show }: { show: boolean }) {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    let cleanup = 0;
    if (show) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      frame = window.requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      cleanup = window.setTimeout(() => setMounted(false), TRAFFIC_FADE_MS);
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (cleanup) window.clearTimeout(cleanup);
    };
  }, [show]);

  if (!mounted) return null;

  return (
    <Source id="mapbox-traffic" type="vector" url={MAPBOX_TRAFFIC_SOURCE}>
      <Layer
        id="mapbox-traffic-flow-casing"
        source-layer={MAPBOX_TRAFFIC_SOURCE_LAYER}
        type="line"
        minzoom={MAPBOX_TRAFFIC_MIN_ZOOM}
        beforeId="muni-label"
        filter={MAPBOX_TRAFFIC_FLOW_FILTER}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          "line-color": "rgba(250, 248, 240, 0.86)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.4, 12, 4, 16, 8],
          "line-offset": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 16, 2.2],
          "line-opacity": visible ? 0.72 : 0,
          "line-opacity-transition": { duration: TRAFFIC_FADE_MS, delay: 0 },
        }}
      />
      <Layer
        id="mapbox-traffic-flow"
        source-layer={MAPBOX_TRAFFIC_SOURCE_LAYER}
        type="line"
        minzoom={MAPBOX_TRAFFIC_MIN_ZOOM}
        beforeId="muni-label"
        filter={MAPBOX_TRAFFIC_FLOW_FILTER}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          ...MAPBOX_TRAFFIC_FLOW_PAINT,
          "line-opacity": visible ? 0.88 : 0,
          "line-opacity-transition": { duration: TRAFFIC_FADE_MS, delay: 0 },
        }}
      />
      <Layer
        id="mapbox-traffic-closures"
        source-layer={MAPBOX_TRAFFIC_SOURCE_LAYER}
        type="line"
        minzoom={MAPBOX_TRAFFIC_MIN_ZOOM}
        beforeId="muni-label"
        filter={MAPBOX_TRAFFIC_CLOSURE_FILTER}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          ...MAPBOX_TRAFFIC_CLOSURE_PAINT,
          "line-opacity": visible ? 0.96 : 0,
          "line-opacity-transition": { duration: TRAFFIC_FADE_MS, delay: 0 },
        }}
      />
    </Source>
  );
}
