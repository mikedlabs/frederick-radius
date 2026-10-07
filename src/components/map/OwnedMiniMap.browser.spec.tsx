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

import OwnedMiniMap, { miniMapPinsCamera, type OwnedMiniMapPin } from "./OwnedMiniMap";

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
    // The fallback mount is a setTimeout(0). With real timers an async act()
    // on a busy machine can let it fire before the first assertion, so hold
    // the clock and release it explicitly.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await render(null);
      expect(canvas()).toBeNull();

      await act(async () => {
        vi.runOnlyPendingTimers();
      });
    } finally {
      vi.useRealTimers();
    }

    expect(box()?.dataset.ownedMiniMap).toBe("loading");
    expect(canvas()).not.toBeNull();
    expect(picture()?.getAttribute("aria-label")).toBe(
      "Location of Carroll Creek Linear Park",
    );
  });
});

// Four real downtown coffee results: Ibiza Cafe, Frederick Coffee Company,
// Gravel & Grind, and North Market Pop Shop.
const DOWNTOWN_PINS: OwnedMiniMapPin[] = [
  { lng: -77.4109474, lat: 39.4189606, label: "1", name: "Ibiza Cafe" },
  { lng: -77.405065, lat: 39.415299, label: "2", name: "Frederick Coffee Company" },
  { lng: -77.409217, lat: 39.4216984, label: "3", name: "Gravel & Grind" },
  { lng: -77.4107529, lat: 39.4176334, label: "4", name: "North Market Pop Shop" },
];

describe("miniMapPinsCamera", () => {
  it("frames every pin inside the narrowest phone box with room for the pin heads", () => {
    const camera = miniMapPinsCamera(DOWNTOWN_PINS);
    expect(camera.zoom).toBeGreaterThan(13);
    expect(camera.zoom).toBeLessThanOrEqual(15.5);
    for (const { x, y } of camera.offsets) {
      // 288 x 176 box: a 26 x 32 pin rises above its tip and needs half its
      // width on either side.
      expect(Math.abs(x)).toBeLessThanOrEqual(144 - 13);
      expect(y - 32).toBeGreaterThanOrEqual(-88);
      expect(y).toBeLessThanOrEqual(88);
    }
  });

  it("projects pins the way MapLibre does, so they sit on the right streets", () => {
    const camera = miniMapPinsCamera(DOWNTOWN_PINS);
    // Ibiza Cafe is west of Frederick Coffee Company and south of Gravel &
    // Grind, so its pin must be left of the one and below the other.
    expect(camera.offsets[0].x).toBeLessThan(camera.offsets[1].x);
    expect(camera.offsets[0].y).toBeGreaterThan(camera.offsets[2].y);
    // At zoom z the world is 512 * 2^z px wide.
    const worldPx = 512 * 2 ** camera.zoom;
    const expectedDx = ((DOWNTOWN_PINS[1].lng - DOWNTOWN_PINS[0].lng) / 360) * worldPx;
    expect(camera.offsets[1].x - camera.offsets[0].x).toBeCloseTo(expectedDx, 0);
  });

  it("keeps a single pin at the place-page block zoom and never zooms past it", () => {
    const camera = miniMapPinsCamera([DOWNTOWN_PINS[0]]);
    expect(camera.zoom).toBe(15.5);
    expect(camera.offsets[0].x).toBe(0);
    // The tip sits a little below center so the pin head stays inside.
    expect(camera.offsets[0].y).toBeGreaterThan(0);
  });

  it("zooms out to fit pins across the county without going past the county view", () => {
    const camera = miniMapPinsCamera([
      { lng: -77.6743, lat: 39.3229 }, // Brunswick
      { lng: -77.4105, lat: 39.6481 }, // Thurmont
    ]);
    expect(camera.zoom).toBeGreaterThanOrEqual(8);
    expect(camera.zoom).toBeLessThan(11);
  });
});

describe("OwnedMiniMap with numbered pins", () => {
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
  });

  async function renderPins(pins: OwnedMiniMapPin[] = DOWNTOWN_PINS) {
    await act(async () => {
      root.render(createElement(OwnedMiniMap, { pins, name: "these results" }));
    });
  }

  const pinLabels = () =>
    [...container.querySelectorAll<SVGElement>("[data-mini-map-pin]")].map(
      (pin) => pin.getAttribute("data-mini-map-pin"),
    );

  it("draws every numbered pin before the basemap loads, first result on top", async () => {
    await renderPins();

    expect(
      container.querySelector("[data-owned-mini-map]")?.getAttribute("data-owned-mini-map"),
    ).toBe("placeholder");
    // DOM order paints later pins over earlier ones, so pin 1 comes last.
    expect(pinLabels()).toEqual(["4", "3", "2", "1"]);
    expect(container.querySelector('[data-mini-map-pin="1"] text')?.textContent).toBe("1");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "Locations of these results: 1 Ibiza Cafe, 2 Frederick Coffee Company, 3 Gravel & Grind, 4 North Market Pop Shop",
    );
  });

  it("hands MapLibre the same camera the pins were placed with", async () => {
    await renderPins();
    await act(async () => MockIntersectionObserver.instances[0].fire(true));
    const camera = miniMapPinsCamera(DOWNTOWN_PINS);
    expect(canvasHarness.props).toMatchObject({
      lng: camera.lng,
      lat: camera.lat,
      zoom: camera.zoom,
    });
    const ibiza = container.querySelector<SVGElement>('[data-mini-map-pin="1"]');
    // The browser normalizes calc(50% + -n px) to calc(50% - n px).
    const fromCenter = (px: number) =>
      px < 0 ? `calc(50% - ${-px}px)` : `calc(50% + ${px}px)`;
    expect(ibiza?.style.left).toBe(fromCenter(camera.offsets[0].x));
    expect(ibiza?.style.top).toBe(fromCenter(camera.offsets[0].y));

    await act(async () => canvasHarness.props?.onStatus("ready"));
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toMatch(
      /^Map of these results: 1 Ibiza Cafe/,
    );
    expect(container.textContent).toContain("© OpenStreetMap");
  });

  it("promises no Open map handoff because results maps are not links", async () => {
    await renderPins();
    expect(container.textContent).not.toContain("Open map");
    // The map uses the whole box instead of reserving the caption bar.
    expect(container.querySelector('[role="img"]')?.className).toContain("bottom-0");
  });

  it("renders nothing for an empty pin list", async () => {
    await renderPins([]);
    expect(container.querySelector("[data-owned-mini-map]")).toBeNull();
  });

  it("keeps the single-pin place map unchanged", async () => {
    await act(async () => {
      root.render(
        createElement(OwnedMiniMap, {
          lng: -77.40837,
          lat: 39.41279,
          zoom: 15.5,
          name: "Carroll Creek Linear Park",
        }),
      );
    });
    expect(pinLabels()).toEqual([""]);
    expect(container.querySelector("[data-mini-map-pin] circle")).not.toBeNull();
    expect(container.textContent).toContain("Open map");
  });
});
