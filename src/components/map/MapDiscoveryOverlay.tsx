"use client";

import { Layer, Source } from "react-map-gl/mapbox";
import { BRAND } from "@/lib/brand";
import type { MapDiscovery } from "./mapDiscoveries";

/** Draw the selected finding as a small constellation. The line is an
 * explanatory relationship, not a route, so it is deliberately dashed. */
export default function MapDiscoveryOverlay({ discovery }: { discovery: MapDiscovery | null }) {
  const anchor = discovery?.points[0];
  const points = {
    type: "FeatureCollection" as const,
    features: (discovery?.points ?? []).map((point, index) => ({
      type: "Feature" as const,
      properties: { kind: point.kind, label: point.label, anchor: index === 0 },
      geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] },
    })),
  };
  const connections = {
    type: "FeatureCollection" as const,
    features: anchor
      ? (discovery?.points.slice(1) ?? []).map((point) => ({
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: [[anchor.lng, anchor.lat], [point.lng, point.lat]],
          },
        }))
      : [],
  };

  if (!discovery) return null;
  return (
    <>
      <Source id="radius-finding-lines" type="geojson" data={connections}>
        <Layer
          id="radius-finding-line"
          type="line"
          paint={{
            "line-color": BRAND.colors.brick,
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.2, 15, 2.4],
            "line-opacity": 0.72,
            "line-dasharray": [1.4, 1.4],
          }}
        />
      </Source>
      <Source id="radius-finding-points" type="geojson" data={points}>
        <Layer
          id="radius-finding-halo"
          type="circle"
          paint={{
            "circle-radius": ["case", ["get", "anchor"], 13, 10],
            "circle-color": BRAND.colors.surface,
            "circle-opacity": 0.94,
            "circle-stroke-color": BRAND.colors.brick,
            "circle-stroke-width": 2.5,
          }}
        />
        <Layer
          id="radius-finding-point"
          type="circle"
          paint={{
            "circle-radius": ["case", ["get", "anchor"], 6.5, 4.5],
            "circle-color": [
              "match", ["get", "kind"],
              "amenity", BRAND.colors.forest,
              "parking", BRAND.colors.creek,
              "transit", BRAND.colors.ridge,
              "history", BRAND.colors.ink,
              "photo", BRAND.colors.plum,
              "event", BRAND.colors.brick,
              BRAND.colors.brick,
            ],
            "circle-stroke-color": BRAND.colors.surface,
            "circle-stroke-width": 1.5,
          }}
        />
      </Source>
    </>
  );
}
