// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CanvasProps = {
  lng: number;
  lat: number;
  zoom: number;
  onStatus: (status: "ready" | "unavailable") => void;
};

const canvasHarness = vi.hoisted(() => ({
  props: null as null | CanvasProps,
}));

// The real canvas is the lazily imported MapLibre chunk. This stand-in
// records its props and hands the test the status hook.
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockOwnedMiniMapCanvas(props: CanvasProps) {
      canvasHarness.props = props;
      return createElement("div", { "data-test-canvas": "" });
    },
}));

import OwnedMiniMap from "./OwnedMiniMap";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly targets: Element[] = [];
  disconnected = false;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire(isIntersecting: boolean) {
    this.callback(
      this.targets.map(
        (target) => ({ isIntersecting, target }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

describe("OwnedMiniMap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    canvasHarness.props = null;
    MockIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "connection");
  });

  async function render(address: string | null = "50 Carroll Creek Way") {
    await act(async () => {
      root.render(
        createElement(OwnedMiniMap, {
          lng: -77.40837,
          lat: 39.41279,
          zoom: 15.5,
          name: "Carroll Creek Linear Park",
          address,
        }),
      );
    });
  }

  const box = () => container.querySelector<HTMLElement>("[data-owned-mini-map]");
  const picture = () => container.querySelector<HTMLElement>('[role="img"]');
  const canvas = () => container.querySelector("[data-test-canvas]");
  const addressLine = () => container.querySelector("[data-mini-map-address]");

  it("shows the Cream placeholder and waits for the viewport before mounting MapLibre", async () => {
    await render();

    expect(box()?.dataset.ownedMiniMap).toBe("placeholder");
    expect(canvas()).toBeNull();
    expect(addressLine()?.textContent).toBe("50 Carroll Creek Way");
    expect(picture()?.getAttribute("aria-label")).toBe(
      "Location of Carroll Creek Linear Park, 50 Carroll Creek Way",
    );

    const [observer] = MockIntersectionObserver.instances;
    expect(observer?.targets).toEqual([box()]);
    expect(observer?.options?.rootMargin).toBe("240px 0px");

    await act(async () => observer.fire(false));
    expect(canvas()).toBeNull();

    await act(async () => observer.fire(true));
    expect(observer.disconnected).toBe(true);
    expect(box()?.dataset.ownedMiniMap).toBe("loading");
    expect(canvas()).not.toBeNull();
    expect(canvasHarness.props).toMatchObject({ lng: -77.40837, lat: 39.41279, zoom: 15.5 });
    // Still the placeholder until the first complete frame.
    expect(addressLine()).not.toBeNull();
    expect(canvas()?.parentElement?.className).toContain("opacity-0");
  });

  it("reveals the map and names it once the basemap has drawn", async () => {
    await render();
    await act(async () => MockIntersectionObserver.instances[0].fire(true));
    await act(async () => canvasHarness.props?.onStatus("ready"));

    expect(box()?.dataset.ownedMiniMap).toBe("ready");
    expect(picture()?.getAttribute("aria-label")).toBe(
      "Map of the area around Carroll Creek Linear Park",
    );
    expect(addressLine()).toBeNull();
    expect(canvas()?.parentElement?.className).toContain("opacity-100");
    expect(canvas()?.parentElement?.className).toContain("motion-reduce:transition-none");
    expect(container.textContent).toContain("© OpenStreetMap");
    expect(container.textContent).toContain("Open map");
  });

  it("keeps the placeholder as the final state when WebGL or the basemap fails", async () => {
    await render();
    await act(async () => MockIntersectionObserver.instances[0].fire(true));
    await act(async () => canvasHarness.props?.onStatus("unavailable"));

    expect(box()?.dataset.ownedMiniMap).toBe("unavailable");
    expect(canvas()).toBeNull();
    expect(addressLine()?.textContent).toBe("50 Carroll Creek Way");
    expect(picture()?.getAttribute("aria-label")).toBe(
      "Location of Carroll Creek Linear Park, 50 Carroll Creek Way",
    );
    expect(container.textContent).not.toContain("© OpenStreetMap");
  });

  it("does not let a late load revive a map that already failed", async () => {
    await render();
    await act(async () => MockIntersectionObserver.instances[0].fire(true));
    const { onStatus } = canvasHarness.props!;
    await act(async () => onStatus("unavailable"));
    await act(async () => onStatus("ready"));

    expect(box()?.dataset.ownedMiniMap).toBe("unavailable");
    expect(canvas()).toBeNull();
  });

  it("never loads the map under Save-Data", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    await render();
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(box()?.dataset.ownedMiniMap).toBe("placeholder");
    expect(canvas()).toBeNull();
    expect(addressLine()).not.toBeNull();
  });

  it("mounts after the first paint when IntersectionObserver is missing", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await render(null);
    expect(canvas()).toBeNull();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(box()?.dataset.ownedMiniMap).toBe("loading");
    expect(canvas()).not.toBeNull();
    expect(picture()?.getAttribute("aria-label")).toBe(
      "Location of Carroll Creek Linear Park",
    );
  });
});
