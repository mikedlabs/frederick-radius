"use client";

import { Layer, Source } from "react-map-gl/mapbox";
import type { FilterSpecification } from "mapbox-gl";

/**
 * Mapbox supplies road-flow context; Maryland CHART and Radius's reviewed
 * incident feeds remain the authority for local closures and disruptions.
 * Traffic v1 updates speed/density about every eight minutes. Keeping this as
 * one quiet opt-in drape makes congestion legible without turning the county
 * map into a permanent red/yellow road diagram.
 */
export default function MapboxTraffic({ show }: { show: boolean }) {
  if (!show) return null;

  const visibleTraffic = [
    "any",
    ["has", "congestion"],
    ["==", ["get", "closed"], "yes"],
  ] as FilterSpecification;

  return (
    <Source
      id="mapbox-traffic"
      type="vector"
      url="mapbox://mapbox.mapbox-traffic-v1"
    >
      <Layer
        id="traffic-congestion-casing"
        source-layer="traffic"
        type="line"
        minzoom={8}
        beforeId="muni-label"
        filter={visibleTraffic}
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
        id="traffic-congestion"
        source-layer="traffic"
        type="line"
        minzoom={8}
        beforeId="muni-label"
        filter={visibleTraffic}
        layout={{
          "line-cap": "round",
          "line-join": "round",
        }}
        paint={{
          "line-color": [
            "case",
            ["==", ["get", "closed"], "yes"],
            "#A62E24",
            [
              "match",
              ["get", "congestion"],
              "low",
              "#5D8B68",
              "moderate",
              "#C7922F",
              "heavy",
              "#C85C32",
              "severe",
              "#A62E24",
              "rgba(92, 90, 80, 0.28)",
            ],
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            1.2,
            12,
            2.2,
            16,
            5,
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
          "line-opacity": 0.86,
        }}
      />
    </Source>
  );
}
