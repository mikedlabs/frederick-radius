"use client";

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

/**
 * Mapbox supplies road-flow context; Maryland CHART and Radius's reviewed
 * incident feeds remain the authority for local closures and disruptions.
 * Traffic v1 updates speed/density about every eight minutes. Keeping this as
 * one quiet opt-in drape makes congestion legible without turning the county
 * map into a permanent red/yellow road diagram.
 */
export default function MapboxTraffic({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <Source
      id="mapbox-traffic"
      type="vector"
      url={MAPBOX_TRAFFIC_SOURCE}
    >
      <Layer
        id="mapbox-traffic-flow-casing"
        source-layer={MAPBOX_TRAFFIC_SOURCE_LAYER}
        type="line"
        minzoom={MAPBOX_TRAFFIC_MIN_ZOOM}
        beforeId="muni-label"
        filter={MAPBOX_TRAFFIC_FLOW_FILTER}
        layout={{
          "line-cap": "round",
          "line-join": "round",
        }}
        paint={{
          "line-color": "rgba(250, 250, 247, 0.82)",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            2.4,
            12,
            4,
            16,
            8,
          ],
          "line-offset": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            0.4,
            16,
            2.2,
          ],
          "line-opacity": 0.72,
        }}
      />
      <Layer
        id="mapbox-traffic-flow"
        source-layer={MAPBOX_TRAFFIC_SOURCE_LAYER}
        type="line"
        minzoom={MAPBOX_TRAFFIC_MIN_ZOOM}
        beforeId="muni-label"
        filter={MAPBOX_TRAFFIC_FLOW_FILTER}
        layout={{
          "line-cap": "round",
          "line-join": "round",
        }}
        paint={MAPBOX_TRAFFIC_FLOW_PAINT}
      />
      <Layer
        id="mapbox-traffic-closures"
        source-layer={MAPBOX_TRAFFIC_SOURCE_LAYER}
        type="line"
        minzoom={MAPBOX_TRAFFIC_MIN_ZOOM}
        beforeId="muni-label"
        filter={MAPBOX_TRAFFIC_CLOSURE_FILTER}
        layout={{
          "line-cap": "round",
          "line-join": "round",
        }}
        paint={MAPBOX_TRAFFIC_CLOSURE_PAINT}
      />
    </Source>
  );
}
