// @vitest-environment jsdom

import {
  act,
  createElement,
  forwardRef,
  useImperativeHandle,
  type ComponentProps,
  type ForwardedRef,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MapHarnessProps = {
  children?: ReactNode;
  onLoad?: () => void;
  onError?: (event: { error: Error }) => void;
};

const mapHarness = vi.hoisted(() => {
  let props: unknown = null;
  let failOnRender = false;
  return {
    capture: (nextProps: unknown) => {
      props = nextProps;
    },
    getProps: () => props,
    failNextRender: () => {
      failOnRender = true;
    },
    shouldFail: () => failOnRender,
    reset: () => {
      props = null;
      failOnRender = false;
    },
  };
});

vi.mock("react-map-gl/maplibre", () => ({
  default: forwardRef(function MockMapCanvas(
    props: MapHarnessProps,
    ref: ForwardedRef<unknown>,
  ) {
    if (mapHarness.shouldFail()) {
      throw new Error("Late map render failure");
    }
    const canvas = document.createElement("canvas");
    mapHarness.capture(props);
    useImperativeHandle(ref, () => ({
      getMap: () => ({
        easeTo: vi.fn(),
        fitBounds: vi.fn(),
        getCanvas: () => canvas,
        getZoom: () => 16.25,
        project: ([longitude, latitude]: [number, number]) => ({
          x: longitude,
          y: latitude,
        }),
        resize: vi.fn(),
      }),
      getZoom: () => 16.25,
    }));
    return createElement(
      "div",
      { "data-mock-map-canvas": "" },
      createElement(
        "button",
        { type: "button", "data-mock-map-focus": "" },
        "Mock map marker",
      ),
      props.children,
    );
  }),
  AttributionControl: () => null,
  Layer: ({ id }: { id?: string }) =>
    createElement("div", { "data-mock-map-layer": id }),
  Marker: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  NavigationControl: () => null,
  Source: ({ children, id }: { children?: ReactNode; id?: string }) =>
    createElement("div", { "data-mock-map-source": id }, children),
}));

vi.mock("@/components/map/mapCameraHelpers", () => ({
  hasWebGL: () => true,
}));
vi.mock("@/components/map/useFrederickFlavorStyle", () => ({
  useFrederickFlavorStyle: () => ({}),
}));
vi.mock("@/data/fair/great-frederick-fair-2026-map-overlays", () => ({
  greatFrederickFair2026MapAdditions: [],
  greatFrederickFair2026MapPatches: [],
}));
vi.mock("@/lib/fair/car-memory", () => ({
  readSavedFairCar: () => null,
}));

import FairGroundsMapInner, { fairMeetHereUrl } from "./FairGroundsMapInner";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const MAP_FIXTURE = {
  type: "FeatureCollection",
  id: "great-frederick-fair-2026-grounds-map",
  reviewedOn: "2026-09-02",
  source: {
    publisher: "OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    license: "ODbL 1.0",
    snapshotSha256: "a".repeat(64),
  },
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [-77.3944867, 39.4107704],
      },
      properties: {
        id: "osm-node-14099608925",
        name: "Gate 1",
        kind: "gate",
        sourceUrl: "https://www.openstreetmap.org/node/14099608925",
        sourceUpdatedAt: "2026-08-16T19:12:58Z",
        scheduleAliases: [],
        anchor: [-77.3944867, 39.4107704],
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [-77.39432, 39.41095],
      },
      properties: {
        id: "osm-node-14099608926",
        name: "Gate 2",
        kind: "gate",
        sourceUrl: "https://www.openstreetmap.org/node/14099608926",
        sourceUpdatedAt: "2026-08-16T19:12:58Z",
        scheduleAliases: [],
        anchor: [-77.39432, 39.41095],
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [-77.39358, 39.41326],
      },
      properties: {
        id: "osm-way-103615596",
        name: "Grandstand",
        kind: "building",
        sourceUrl: "https://www.openstreetmap.org/way/103615596",
        sourceUpdatedAt: "2026-08-16T19:12:58Z",
        scheduleAliases: ["Grandstand"],
        anchor: [-77.39358, 39.41326],
      },
    },
  ],
};

function successfulMapResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => MAP_FIXTURE,
  } as Response;
}

describe("FairGroundsMapInner map failure recovery", () => {
  let container: HTMLDivElement;
  let frameCallbacks: FrameRequestCallback[];
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    mapHarness.reset();
    frameCallbacks = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => successfulMapResponse()),
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
      })),
    );
    Object.defineProperties(window.HTMLDialogElement.prototype, {
      close: {
        configurable: true,
        value() {
          this.removeAttribute("open");
        },
      },
      show: {
        configurable: true,
        value() {
          this.setAttribute("open", "");
        },
      },
      showModal: {
        configurable: true,
        value() {
          this.setAttribute("open", "");
        },
      },
    });
    window.history.replaceState({}, "", "/fair-map-test");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function settleMapSnapshot() {
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
  }

  async function renderMapShell(
    overrides: Partial<ComponentProps<typeof FairGroundsMapInner>> = {},
  ) {
    await act(async () => {
      root.render(
        createElement(FairGroundsMapInner, {
          savedStops: [],
          programItems: [],
          onBrowseProgram: vi.fn(),
          ...overrides,
        }),
      );
    });
    await settleMapSnapshot();
  }

  async function renderMap(
    overrides: Partial<ComponentProps<typeof FairGroundsMapInner>> = {},
  ) {
    await renderMapShell(overrides);
    expect(container.querySelector("[data-mock-map-canvas]")).not.toBeNull();
  }

  async function loadMap() {
    const onLoad = (mapHarness.getProps() as MapHarnessProps | null)?.onLoad;
    if (!onLoad) throw new Error("Missing mocked map load handler.");
    await act(async () => onLoad());
  }

  async function failMap() {
    const onError = (mapHarness.getProps() as MapHarnessProps | null)?.onError;
    if (!onError) throw new Error("Missing mocked map error handler.");
    await act(async () =>
      onError({ error: new Error("WebGL context lost") }),
    );
    await flushAnimationFrames();
  }

  async function flushAnimationFrames() {
    const callbacks = frameCallbacks.splice(0);
    await act(async () => {
      callbacks.forEach((callback) => callback(performance.now()));
    });
  }

  it("builds a public meeting-place link without sharing a visitor location or private plan", () => {
    const url = new URL(
      fairMeetHereUrl(
        "https://frederickradius.app",
        "osm-way-103615596",
      ),
    );

    expect(url.pathname).toBe("/moments/great-frederick-fair-2026");
    expect(url.searchParams.get("meet")).toBe("osm-way-103615596");
    expect(url.hash).toBe("#fair-map");
    expect(url.searchParams.has("location")).toBe(false);
    expect(url.searchParams.has("plan")).toBe(false);
  });

  it("opens the exact reviewed place from a shared meeting link", async () => {
    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026?meet=osm-way-103615596#fair-map",
    );

    await renderMap();
    await flushAnimationFrames();

    expect(
      container.querySelector("[data-fair-map-selection]")?.textContent,
    ).toContain("Grandstand");
    expect(
      container.querySelector<HTMLButtonElement>("[data-fair-meet-here]")
        ?.textContent,
    ).toContain("Meet here");
    expect(
      container.querySelector<HTMLSelectElement>("[data-fair-map-filter-select]")
        ?.value,
    ).toBe("buildings");
  });

  it("uses one URL-backed history layer for map selections and restores it with Back and Forward", async () => {
    await renderMap();
    await loadMap();
    await flushAnimationFrames();
    const view = container.querySelector<HTMLSelectElement>(
      "[data-fair-map-filter-select]",
    );
    if (!view) throw new Error("Missing map view control.");
    await act(async () => {
      view.value = "essentials";
      view.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const listButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    );
    const gateOne = listButtons.find((button) =>
      button.textContent?.includes("Gate 1"),
    );
    const gateTwo = listButtons.find((button) =>
      button.textContent?.includes("Gate 2"),
    );
    if (!gateOne || !gateTwo) {
      throw new Error(
        `Missing reviewed gate controls: ${listButtons
          .map((button) => button.textContent?.trim())
          .filter(Boolean)
          .join(" | ")}`,
      );
    }

    const historyLength = window.history.length;
    await act(async () => gateOne.click());
    expect(new URLSearchParams(window.location.search).get("meet")).toBe(
      "osm-node-14099608925",
    );
    expect(window.location.hash).toBe("#fair-map");
    expect(window.history.length).toBe(historyLength + 1);
    const selectionState = window.history.state;

    await act(async () => gateTwo.click());
    expect(new URLSearchParams(window.location.search).get("meet")).toBe(
      "osm-node-14099608926",
    );
    expect(window.history.length).toBe(historyLength + 1);

    window.history.replaceState({}, "", "/fair-map-test#fair-map");
    await act(async () =>
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} })),
    );
    await flushAnimationFrames();
    expect(container.querySelector("[data-fair-map-selection]")).toBeNull();
    expect(container.textContent).toContain("Map place details closed.");

    window.history.replaceState(
      selectionState,
      "",
      "/fair-map-test?meet=osm-node-14099608926#fair-map",
    );
    await act(async () =>
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: selectionState }),
      ),
    );
    await flushAnimationFrames();
    expect(
      container.querySelector("[data-fair-map-selection]")?.textContent,
    ).toContain("Gate 2");
  });

  it("closes a directly opened meeting place without leaving the Fair map", async () => {
    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026?meet=osm-way-103615596#fair-map",
    );
    await renderMap();
    await flushAnimationFrames();
    const close = container.querySelector<HTMLButtonElement>(
      '[data-fair-map-selection] button[aria-label="Close selected map place"]',
    );
    if (!close) throw new Error("Missing selected-place close control.");

    await act(async () => close.click());

    expect(container.querySelector("[data-fair-map-selection]")).toBeNull();
    expect(window.location.pathname).toBe(
      "/moments/great-frederick-fair-2026",
    );
    expect(new URLSearchParams(window.location.search).has("meet")).toBe(false);
    expect(window.location.hash).toBe("#fair-map");
  });

  it("clears a selected meeting place when the visitor changes map layers", async () => {
    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026?meet=osm-way-103615596#fair-map",
    );
    await renderMap();
    await loadMap();
    await flushAnimationFrames();
    const view = container.querySelector<HTMLSelectElement>(
      "[data-fair-map-filter-select]",
    );
    if (!view) throw new Error("Missing map view control.");

    await act(async () => {
      view.value = "essentials";
      view.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.querySelector("[data-fair-map-selection]")).toBeNull();
    expect(new URLSearchParams(window.location.search).has("meet")).toBe(false);
    expect(window.location.hash).toBe("#fair-map");
    expect(view.value).toBe("essentials");
  });

  it("shares only the reviewed public place even when the current URL contains private state", async () => {
    const share = vi
      .fn<(data: ShareData) => Promise<void>>()
      .mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026?meet=osm-way-103615596&lat=39.41&lng=-77.39&plan=private#fair-map",
    );

    await renderMap();
    await flushAnimationFrames();

    const meetHere = container.querySelector<HTMLButtonElement>(
      "[data-fair-meet-here]",
    );
    if (!meetHere) throw new Error("Missing meeting-place share action.");
    expect(meetHere.getAttribute("aria-label")).toBe(
      "Share Grandstand as a meeting place",
    );
    await act(async () => meetHere.click());

    expect(share).toHaveBeenCalledOnce();
    const payload = share.mock.calls[0]?.[0];
    if (!payload) throw new Error("Missing native share payload.");
    const sharedUrl = new URL(payload.url as string);
    expect([...sharedUrl.searchParams.keys()]).toEqual(["meet"]);
    expect(sharedUrl.searchParams.get("meet")).toBe("osm-way-103615596");
    expect(sharedUrl.hash).toBe("#fair-map");
    expect(payload.text).toContain("Meet me at Grandstand");
  });

  it("does not carry copied feedback onto a newly selected meeting place", async () => {
    const writeText = vi
      .fn<(value: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    window.history.replaceState(
      {},
      "",
      "/moments/great-frederick-fair-2026?meet=osm-node-14099608925#fair-map",
    );

    await renderMap();
    await flushAnimationFrames();

    const firstMeetHere = container.querySelector<HTMLButtonElement>(
      "[data-fair-meet-here]",
    );
    if (!firstMeetHere) throw new Error("Missing first meeting-place share action.");
    await act(async () => {
      firstMeetHere.click();
      await Promise.resolve();
    });
    expect(firstMeetHere.textContent).toContain("Link copied");

    const gateTwo = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        "#fair-map-place-list button",
      ),
    ).find((button) => button.textContent?.includes("Gate 2"));
    if (!gateTwo) throw new Error("Missing second reviewed meeting place.");
    await act(async () => gateTwo.click());

    const nextMeetHere = container.querySelector<HTMLButtonElement>(
      "[data-fair-meet-here]",
    );
    expect(nextMeetHere?.textContent).toContain("Meet here");
    expect(nextMeetHere?.getAttribute("aria-label")).toBe(
      "Share Gate 2 as a meeting place",
    );
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "meet=osm-node-14099608925",
    );
  });

  function runtimeStatus() {
    const status = container.querySelector<HTMLElement>('p[role="status"]');
    if (!status) throw new Error("Missing Fair map runtime status.");
    return status;
  }

  it("keeps the fallback usable and recovers from a 503 with one explicit retry", async () => {
    let resolveRetry: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveRetry = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const browseProgram = vi.fn();

    await renderMapShell({ onBrowseProgram: browseProgram });

    const fallback = container.querySelector<HTMLElement>(
      "[data-fair-map-snapshot-fallback]",
    );
    expect(fallback?.getAttribute("role")).toBe("region");
    expect(fallback?.getAttribute("aria-labelledby")).toBe(
      "fair-map-snapshot-fallback-heading",
    );
    expect(runtimeStatus().getAttribute("aria-live")).toBe("polite");
    expect(runtimeStatus().getAttribute("aria-atomic")).toBe("true");

    const browseButton = Array.from(
      fallback?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((button) => button.textContent === "Browse the program");
    if (!browseButton) throw new Error("Missing Fair program fallback.");
    await act(async () => browseButton.click());
    expect(browseProgram).toHaveBeenCalledOnce();

    const retryButton = Array.from(
      fallback?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((button) => button.textContent === "Retry grounds map");
    if (!retryButton) throw new Error("Missing Fair map retry.");
    retryButton.focus();
    await act(async () => retryButton.click());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retryButton.disabled).toBe(true);
    expect(retryButton.textContent).toBe("Retrying…");
    expect(runtimeStatus().textContent).toBe(
      "Radius is retrying the reviewed map now.",
    );
    retryButton.click();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    if (!resolveRetry) throw new Error("Missing deferred retry request.");
    const completeRetry = resolveRetry;
    await act(async () => {
      completeRetry(successfulMapResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAnimationFrames();

    expect(container.querySelector("[data-mock-map-canvas]")).not.toBeNull();
    expect(runtimeStatus().textContent).toBe(
      "The reviewed Fairgrounds map is ready.",
    );
    expect(document.activeElement?.id).toBe("fair-map-search");
  });

  it("offers the same explicit recovery after an interrupted snapshot request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(
        new DOMException("The map request was interrupted.", "AbortError"),
      )
      .mockResolvedValueOnce(successfulMapResponse());
    vi.stubGlobal("fetch", fetchMock);

    await renderMapShell();

    expect(container.textContent).toContain("The grounds map could not open.");
    const retryButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Retry grounds map");
    if (!retryButton) throw new Error("Missing Fair map retry.");

    await act(async () => retryButton.click());
    await settleMapSnapshot();
    await flushAnimationFrames();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        cache: "no-cache",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(container.querySelector("[data-mock-map-canvas]")).not.toBeNull();
    expect(container.textContent).not.toContain(
      "The grounds map could not open.",
    );
    expect(document.activeElement?.id).toBe("fair-map-search");
  });

  it("announces a late fatal error and moves focus out of removed map UI", async () => {
    await renderMap();
    await loadMap();
    const mapControl = container.querySelector<HTMLButtonElement>(
      "[data-mock-map-focus]",
    );
    if (!mapControl) throw new Error("Missing mocked map control.");
    mapControl.focus();

    await failMap();

    expect(container.textContent).toContain("The interactive map stopped working.");
    expect(runtimeStatus().textContent).toBe(
      "The interactive Fairgrounds map became unavailable. Search or browse the reviewed places instead.",
    );
    expect(runtimeStatus().getAttribute("aria-live")).toBe("polite");
    expect(runtimeStatus().getAttribute("aria-atomic")).toBe("true");
    expect(document.activeElement?.id).toBe("fair-map-fallback-heading");
  });

  it("keeps reviewed grounds shapes visible beneath the active map lens", async () => {
    await renderMap();
    await loadMap();

    expect(
      container.querySelector('[data-mock-map-source="fair-grounds-context"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-mock-map-layer="fair-grounds-context-shadow"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-mock-map-layer="fair-grounds-context-highlight"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-mock-map-source="fair-reviewed-geometry"]'),
    ).not.toBeNull();
  });

  it("counts an unpinned changed stop in the saved-plan map total", async () => {
    await renderMap({
      savedStops: [
        {
          id: "program-grandstand",
          title: "Grandstand show",
          placeLabel: "Published place: Grandstand.",
        },
        {
          id: "removed-show",
          title: "Removed show",
          placeLabel: "",
        },
      ],
    });

    expect(container.textContent).toContain(
      "1 of 2 saved stops have reviewed map geometry",
    );
  });

  it("keeps focus on persistent search UI after a late fatal error", async () => {
    await renderMap();
    await loadMap();
    const search = container.querySelector<HTMLInputElement>("#fair-map-search");
    if (!search) throw new Error("Missing Fair map search.");
    search.focus();

    await failMap();

    expect(document.activeElement).toBe(search);
  });

  it("recovers focus when a boundary failure removes an external map control", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await renderMap();
    await loadMap();
    const filter = container.querySelector<HTMLButtonElement>(
      "[data-fair-map-runtime-control] button",
    );
    if (!filter) throw new Error("Missing Fair map filter control.");
    filter.focus();
    mapHarness.failNextRender();

    await act(async () => {
      root.render(
        createElement(FairGroundsMapInner, {
          savedStops: [],
          programItems: [],
          onBrowseProgram: vi.fn(),
        }),
      );
    });
    await flushAnimationFrames();

    expect(container.textContent).toContain("The interactive map stopped working.");
    expect(document.activeElement?.id).toBe("fair-map-fallback-heading");
  });

  it("uses the same announcement and focus recovery when startup times out", async () => {
    await renderMap();
    const mapControl = container.querySelector<HTMLButtonElement>(
      "[data-mock-map-focus]",
    );
    if (!mapControl) throw new Error("Missing mocked map control.");
    mapControl.focus();

    await act(async () => vi.advanceTimersByTimeAsync(18_000));
    await flushAnimationFrames();

    expect(runtimeStatus().textContent).toBe(
      "The interactive Fairgrounds map could not start. Search or browse the reviewed places instead.",
    );
    expect(document.activeElement?.id).toBe("fair-map-fallback-heading");
  });

  it("ignores a location result that arrives after the map has failed", async () => {
    const pendingLocation: { resolve?: PositionCallback } = {};
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) => {
          pendingLocation.resolve = success;
        },
      },
    });
    await renderMap();
    await loadMap();
    const locate = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        "[data-fair-map-runtime-control]",
      ),
    ).find((button) => button.textContent?.includes("Show my location"));
    if (!locate) throw new Error("Missing location control.");

    await act(async () => locate.click());
    const completeLocation = pendingLocation.resolve;
    if (!completeLocation) throw new Error("Missing pending location callback.");
    await failMap();
    await act(async () =>
      completeLocation({
        coords: {
          accuracy: 5,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          latitude: 39.4125,
          longitude: -77.3943,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      }),
    );

    expect(runtimeStatus().textContent).toBe(
      "The interactive Fairgrounds map became unavailable. Search or browse the reviewed places instead.",
    );
    expect(container.textContent).not.toContain("Your position is shown");
    expect(
      container.querySelector("[data-fair-visitor-location]"),
    ).toBeNull();
  });

  it.each([0, 250, 1_500])(
    "keeps the exact program place pending through a %i ms map-start delay, then focuses and acknowledges it once",
    async (mapStartDelay) => {
      const handled = vi.fn();
      const openProgramItem = vi.fn();
      await renderMap({
        focusRequest: { programItemId: "program-daughtry", requestId: 7 },
        onFocusRequestHandled: handled,
        onOpenProgramItem: openProgramItem,
        programItems: [
          {
            id: "program-daughtry",
            title: "Daughtry",
            timeLabel: "8 p.m.",
            placeLabel: "Published place: Grandstand.",
          },
        ],
      });
      await flushAnimationFrames();

      const view = container.querySelector<HTMLSelectElement>(
        "[data-fair-map-filter-select]",
      );
      expect(view?.value).toBe("program");
      const selectedPlace = container.querySelector<HTMLDialogElement>(
        '#fair-map-selection-mobile[role="region"]',
      );
      expect(selectedPlace?.textContent).toContain("Grandstand");
      expect(handled).not.toHaveBeenCalled();

      await act(async () => vi.advanceTimersByTimeAsync(mapStartDelay));
      expect(handled).not.toHaveBeenCalled();

      await loadMap();
      await flushAnimationFrames();
      const lateMapControl = container.querySelector<HTMLButtonElement>(
        "[data-mock-map-focus]",
      );
      if (!lateMapControl) throw new Error("Missing mocked map control.");
      lateMapControl.focus();

      await act(async () => vi.advanceTimersByTimeAsync(50));
      expect(handled).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(50));

      expect(document.activeElement?.id).toBe(
        "fair-map-selection-mobile-heading",
      );
      expect(handled).toHaveBeenCalledOnce();
      expect(handled).toHaveBeenCalledWith(7);

      const programButton = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button"),
      ).find((button) => button.textContent?.includes("Daughtry"));
      if (!programButton) {
        throw new Error("Missing mapped Daughtry program action.");
      }
      await act(async () => programButton.click());
      window.history.replaceState({}, "", "/fair-map-test#fair-map");
      await act(async () =>
        window.dispatchEvent(new PopStateEvent("popstate", { state: {} })),
      );
      await act(async () => vi.advanceTimersByTimeAsync(0));
      await flushAnimationFrames();

      expect(openProgramItem).toHaveBeenCalledWith("program-daughtry");
      expect(container.textContent).toContain("Grandstand");
    },
  );
});
