// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SourceProps = {
  children?: ReactNode;
  id: string;
  type: string;
  url: string;
};

type LayerProps = {
  id: string;
  filter?: unknown;
  minzoom?: number;
  paint?: Record<string, unknown>;
  "source-layer"?: string;
  type?: string;
  beforeId?: string;
};

const mapboxMocks = vi.hoisted(() => ({
  source: vi.fn(),
  layer: vi.fn(),
}));

vi.mock("react-map-gl/mapbox", () => ({
  Source: (props: SourceProps) => {
    mapboxMocks.source(props);
    return createElement(
      "div",
      { "data-testid": "mapbox-traffic-source" },
      props.children,
    );
  },
  Layer: (props: LayerProps) => {
    mapboxMocks.layer(props);
    return createElement("div", { "data-layer-id": props.id });
  },
}));

import MapboxTraffic from "./MapboxTraffic";
import {
  MAPBOX_TRAFFIC_CLOSURE_FILTER,
  MAPBOX_TRAFFIC_CLOSURE_PAINT,
  MAPBOX_TRAFFIC_FLOW_FILTER,
  MAPBOX_TRAFFIC_FLOW_PAINT,
  MAPBOX_TRAFFIC_MIN_ZOOM,
  MAPBOX_TRAFFIC_SOURCE,
  MAPBOX_TRAFFIC_SOURCE_LAYER,
} from "./mapboxTrafficStyle";

let container: HTMLDivElement;
let root: Root;
let nextFrameId: number;
let frames: Map<number, FrameRequestCallback>;

function latestLayer(id: string): LayerProps | undefined {
  return mapboxMocks.layer.mock.calls
    .map(([props]) => props as LayerProps)
    .findLast((props) => props.id === id);
}

function runNextFrame(timestamp = 16): void {
  const entry = frames.entries().next().value as
    | [number, FrameRequestCallback]
    | undefined;
  expect(entry).toBeDefined();
  if (!entry) return;
  frames.delete(entry[0]);
  act(() => entry[1](timestamp));
}

beforeEach(() => {
  vi.useFakeTimers();
  mapboxMocks.source.mockClear();
  mapboxMocks.layer.mockClear();
  nextFrameId = 0;
  frames = new Map();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrameId;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MapboxTraffic", () => {
  it("uses the Mapbox traffic vector source and distinct flow and closure layers", () => {
    act(() => root.render(createElement(MapboxTraffic, { show: true })));

    expect(mapboxMocks.source).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mapbox-traffic",
        type: "vector",
        url: MAPBOX_TRAFFIC_SOURCE,
      }),
    );

    const expectedLayers = [
      ["mapbox-traffic-flow-casing", MAPBOX_TRAFFIC_FLOW_FILTER],
      ["mapbox-traffic-flow", MAPBOX_TRAFFIC_FLOW_FILTER],
      ["mapbox-traffic-closures", MAPBOX_TRAFFIC_CLOSURE_FILTER],
    ] as const;
    for (const [id, filter] of expectedLayers) {
      expect(latestLayer(id)).toMatchObject({
        id,
        type: "line",
        minzoom: MAPBOX_TRAFFIC_MIN_ZOOM,
        beforeId: "muni-label",
        "source-layer": MAPBOX_TRAFFIC_SOURCE_LAYER,
        filter,
      });
    }

    runNextFrame();
    expect(latestLayer("mapbox-traffic-flow")?.paint).toMatchObject(
      MAPBOX_TRAFFIC_FLOW_PAINT,
    );
    expect(latestLayer("mapbox-traffic-closures")?.paint).toMatchObject(
      MAPBOX_TRAFFIC_CLOSURE_PAINT,
    );
  });

  it("keeps closures out of the congestion flow and renders them separately", () => {
    expect(MAPBOX_TRAFFIC_FLOW_FILTER).toEqual([
      "all",
      [
        "in",
        ["get", "congestion"],
        ["literal", ["moderate", "heavy", "severe"]],
      ],
      ["!=", ["get", "closed"], "yes"],
    ]);
    expect(MAPBOX_TRAFFIC_CLOSURE_FILTER).toEqual([
      "==",
      ["get", "closed"],
      "yes",
    ]);
  });

  it("mounts on demand, fades the layers, and unmounts after the exit transition", () => {
    act(() => root.render(createElement(MapboxTraffic, { show: false })));
    expect(container.querySelector('[data-testid="mapbox-traffic-source"]')).toBeNull();

    act(() => root.render(createElement(MapboxTraffic, { show: true })));
    expect(container.querySelector('[data-testid="mapbox-traffic-source"]')).not.toBeNull();
    expect(latestLayer("mapbox-traffic-flow")?.paint?.["line-opacity"]).toBe(0);
    expect(latestLayer("mapbox-traffic-closures")?.paint?.["line-opacity"]).toBe(0);

    runNextFrame();
    expect(latestLayer("mapbox-traffic-flow")?.paint?.["line-opacity"]).toBe(0.88);
    expect(latestLayer("mapbox-traffic-closures")?.paint?.["line-opacity"]).toBe(0.96);

    act(() => root.render(createElement(MapboxTraffic, { show: false })));
    expect(container.querySelector('[data-testid="mapbox-traffic-source"]')).not.toBeNull();
    expect(latestLayer("mapbox-traffic-flow")?.paint?.["line-opacity"]).toBe(0);

    act(() => vi.advanceTimersByTime(219));
    expect(container.querySelector('[data-testid="mapbox-traffic-source"]')).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('[data-testid="mapbox-traffic-source"]')).toBeNull();
  });
});
