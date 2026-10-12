// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MapProps = {
  initialViewState?: { longitude: number; latitude: number; zoom: number };
  mapStyle?: unknown;
  interactive?: boolean;
  attributionControl?: unknown;
  fadeDuration?: number;
  onLoad?: () => void;
  onError?: (event: { error: Error }) => void;
};

const harness = vi.hoisted(() => ({
  props: null as null | MapProps,
  webgl: true,
  style: { version: 8, sources: {}, layers: [] },
}));

vi.mock("react-map-gl/maplibre", () => ({
  default: function MockMapCanvas(props: MapProps) {
    harness.props = props;
    return createElement("div", { "data-mock-map-canvas": "" });
  },
}));
vi.mock("@/components/map/mapCameraHelpers", () => ({
  hasWebGL: () => harness.webgl,
}));
vi.mock("@/components/map/useFrederickFlavorStyle", () => ({
  useFrederickFlavorStyle: () => harness.style,
}));

import OwnedMiniMapCanvas from "./OwnedMiniMapCanvas";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("OwnedMiniMapCanvas", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onStatus: ReturnType<typeof vi.fn<(status: "ready" | "unavailable") => void>>;

  beforeEach(() => {
    harness.props = null;
    harness.webgl = true;
    onStatus = vi.fn<(status: "ready" | "unavailable") => void>();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function stubReducedMotion(reduce: boolean) {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: reduce && query.includes("prefers-reduced-motion"),
          media: query,
        }) as MediaQueryList,
    );
  }

  async function render() {
    await act(async () => {
      root.render(
        createElement(OwnedMiniMapCanvas, {
          lng: -77.40837,
          lat: 39.41279,
          zoom: 15.5,
          onStatus,
        }),
      );
    });
  }

  it("draws a still, self-hosted map centered on the place", async () => {
    stubReducedMotion(false);
    await render();

    expect(container.querySelector("[data-mock-map-canvas]")).not.toBeNull();
    expect(harness.props?.initialViewState).toEqual({
      longitude: -77.40837,
      latitude: 39.41279,
      zoom: 15.5,
    });
    // No scroll-zoom, drag, or touch capture on a page that scrolls.
    expect(harness.props?.interactive).toBe(false);
    expect(harness.props?.attributionControl).toBe(false);
    expect(harness.props?.mapStyle).toBe(harness.style);
    expect(harness.props?.fadeDuration).toBe(300);
    expect(onStatus).not.toHaveBeenCalled();

    await act(async () => harness.props?.onLoad?.());
    expect(onStatus).toHaveBeenCalledWith("ready");
  });

  it("turns off MapLibre's label fade under reduced motion", async () => {
    stubReducedMotion(true);
    await render();

    expect(harness.props?.fadeDuration).toBe(0);
  });

  it("reports a browser without WebGL 2 instead of constructing a map", async () => {
    harness.webgl = false;
    await render();

    expect(container.querySelector("[data-mock-map-canvas]")).toBeNull();
    expect(harness.props).toBeNull();
    expect(onStatus).toHaveBeenCalledWith("unavailable");
  });

  it("gives up on a cold-start failure but keeps a loaded map through a tile hiccup", async () => {
    await render();

    await act(async () => harness.props?.onError?.({ error: new Error("Failed to fetch") }));
    expect(onStatus).toHaveBeenLastCalledWith("unavailable");

    onStatus.mockClear();
    await act(async () => harness.props?.onLoad?.());
    await act(async () => harness.props?.onError?.({ error: new Error("Failed to fetch") }));
    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith("ready");

    await act(async () => harness.props?.onError?.({ error: new Error("WebGL context lost") }));
    expect(onStatus).toHaveBeenLastCalledWith("unavailable");
  });
});
