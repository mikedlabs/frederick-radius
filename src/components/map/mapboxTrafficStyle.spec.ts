import { describe, expect, it } from "vitest";
import {
  MAPBOX_TRAFFIC_CLOSURE_FILTER,
  MAPBOX_TRAFFIC_CLOSURE_PAINT,
  MAPBOX_TRAFFIC_FLOW_FILTER,
  MAPBOX_TRAFFIC_FLOW_PAINT,
  MAPBOX_TRAFFIC_MIN_ZOOM,
  MAPBOX_TRAFFIC_SOURCE,
  MAPBOX_TRAFFIC_SOURCE_LAYER,
} from "./mapboxTrafficStyle";

describe("Mapbox Traffic overlay contract", () => {
  it("uses the Traffic v1 source and its traffic source-layer", () => {
    expect(MAPBOX_TRAFFIC_SOURCE).toBe("mapbox://mapbox.mapbox-traffic-v1");
    expect(MAPBOX_TRAFFIC_SOURCE_LAYER).toBe("traffic");
    expect(MAPBOX_TRAFFIC_MIN_ZOOM).toBe(8);
  });

  it("draws only useful congestion levels and keeps closures separate", () => {
    expect(JSON.stringify(MAPBOX_TRAFFIC_FLOW_FILTER)).toContain(
      '["moderate","heavy","severe"]',
    );
    expect(JSON.stringify(MAPBOX_TRAFFIC_FLOW_FILTER)).toContain('"closed"');
    expect(JSON.stringify(MAPBOX_TRAFFIC_CLOSURE_FILTER)).toContain('"yes"');
  });

  it("offsets both directions and makes closures visually distinct", () => {
    expect(MAPBOX_TRAFFIC_FLOW_PAINT["line-offset"]).toBeDefined();
    expect(MAPBOX_TRAFFIC_CLOSURE_PAINT["line-offset"]).toBeDefined();
    expect(MAPBOX_TRAFFIC_CLOSURE_PAINT["line-dasharray"]).toEqual([1.25, 1]);
  });
});
