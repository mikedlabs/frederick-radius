import type { FilterSpecification, LineLayerSpecification } from "mapbox-gl";

export const MAPBOX_TRAFFIC_SOURCE = "mapbox://mapbox.mapbox-traffic-v1";
export const MAPBOX_TRAFFIC_SOURCE_LAYER = "traffic";
export const MAPBOX_TRAFFIC_MIN_ZOOM = 8;

export const MAPBOX_TRAFFIC_FLOW_FILTER: FilterSpecification = [
  "all",
  [
    "in",
    ["get", "congestion"],
    ["literal", ["moderate", "heavy", "severe"]],
  ],
  ["!=", ["get", "closed"], "yes"],
];

export const MAPBOX_TRAFFIC_CLOSURE_FILTER: FilterSpecification = [
  "==",
  ["get", "closed"],
  "yes",
];

export const MAPBOX_TRAFFIC_FLOW_PAINT: NonNullable<
  LineLayerSpecification["paint"]
> = {
  "line-color": [
    "match",
    ["get", "congestion"],
    "moderate",
    "#D29A2E",
    "heavy",
    "#D35F2D",
    "severe",
    "#A92F2B",
    "rgba(0,0,0,0)",
  ],
  "line-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    8,
    1.25,
    12,
    2.6,
    16,
    5.5,
  ],
  // Traffic v1 contains both directions of travel. A positive offset keeps
  // the two sides readable instead of painting them directly over each other.
  "line-offset": [
    "interpolate",
    ["linear"],
    ["zoom"],
    8,
    1,
    12,
    2,
    16,
    4,
  ],
  "line-opacity": 0.88,
};

export const MAPBOX_TRAFFIC_CLOSURE_PAINT: NonNullable<
  LineLayerSpecification["paint"]
> = {
  "line-color": "#A92F2B",
  "line-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    8,
    2,
    12,
    3.5,
    16,
    6.5,
  ],
  "line-offset": [
    "interpolate",
    ["linear"],
    ["zoom"],
    8,
    1.25,
    12,
    2.5,
    16,
    4.5,
  ],
  "line-dasharray": [1.25, 1],
  "line-opacity": 0.96,
};
