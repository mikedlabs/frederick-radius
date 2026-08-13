// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ reduced: true }));

vi.mock("react-map-gl/mapbox", () => ({
  Marker: ({
    children,
    longitude,
    latitude,
  }: {
    children?: ReactNode;
    longitude: number;
    latitude: number;
  }) =>
    createElement(
      "div",
      {
        "data-testid": "marker",
        "data-longitude": String(longitude),
        "data-latitude": String(latitude),
      },
      children,
    ),
  Popup: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "popup" }, children),
  Source: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "source" }, children),
  Layer: () => null,
}));

vi.mock("@/lib/motion", () => ({
  shouldLimitLiveEffects: () => motionState.reduced,
}));

vi.mock("@/lib/haptics", () => ({
  haptic: () => undefined,
}));

vi.mock("@/components/transit/useSavedTransitBuses", () => ({
  useSavedTransitBuses: () => ({
    buses: [],
    toggle: () => ({
      buses: [],
      saved: false,
      limitReached: false,
      persistent: true,
    }),
  }),
}));

vi.mock("./liveLayerGate", () => ({
  useLiveLayerGate: () => undefined,
}));

vi.mock("./markerA11y", () => ({
  exposeMarkerChild: () => undefined,
}));

import LiveBuses, {
  LIVE_BUS_GLIDE_VISUAL_UPDATE_MS,
  shouldCommitLiveBusGlideFrame,
} from "./LiveBuses";

const VEHICLE = {
  vehicleId: "bus-1",
  routeId: "6154",
  tripId: "trip-1",
  lat: 39.4143,
  lng: -77.4105,
};

let container: HTMLDivElement;
let root: Root;
let visibility: DocumentVisibilityState;

function response(body: object): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  } as Response);
}

function currentFeed(overrides: Record<string, unknown> = {}) {
  return {
    vehicles: [VEHICLE],
    available: true,
    status: "ok",
    feedTimestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  motionState.reduced = true;
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  vi.stubGlobal(
    "requestAnimationFrame",
    (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    window.clearTimeout(id),
  );
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
  vi.restoreAllMocks();
});

describe("LiveBuses feed sessions", () => {
  it("does not reuse buses from the previous Transit activation", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => response(currentFeed()))
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(createElement(LiveBuses, { show: true }));
    });
    await settle();
    expect(
      container.querySelector('[aria-label*="vehicle bus-1"]'),
    ).not.toBeNull();
    const marker = container.querySelector<HTMLElement>("[data-live-bus-marker]");
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute("aria-label")).toContain("reported position");
    expect(marker?.getAttribute("aria-label")).not.toContain("at a stop");
    expect(marker?.querySelector("svg")).not.toBeNull();

    act(() => root.render(createElement(LiveBuses, { show: false })));
    expect(container.querySelector('[aria-label*="vehicle bus-1"]')).toBeNull();

    act(() => root.render(createElement(LiveBuses, { show: true })));
    expect(container.textContent).toContain("Loading live buses");
    expect(container.querySelector('[aria-label*="vehicle bus-1"]')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps current bus positions but labels missing arrival estimates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        response(currentFeed({ status: "degraded" })),
      ),
    );

    await act(async () => {
      root.render(createElement(LiveBuses, { show: true }));
    });
    await settle();

    expect(
      container.querySelector('[aria-label*="vehicle bus-1"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      "Buses live · arrival estimates unavailable",
    );
  });

  it("lets the browse context rail own feed status and groups buses at county zoom", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        response(
          currentFeed({
            vehicles: [
              VEHICLE,
              { ...VEHICLE, vehicleId: "bus-2", routeId: "6155", lat: 39.43 },
            ],
            status: "degraded",
          }),
        ),
      ),
    );

    await act(async () => {
      root.render(
        createElement(LiveBuses, {
          show: true,
          compactOverview: true,
          overviewZoom: 9.4,
          showInlineStatus: false,
        }),
      );
    });
    await settle();

    expect(container.textContent).not.toContain(
      "Buses live · arrival estimates unavailable",
    );
    expect(container.querySelectorAll("[data-live-bus-marker]")).toHaveLength(0);
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("live");
    expect(
      container.querySelector('[aria-label="2 live buses. Zoom in to see routes."]'),
    ).not.toBeNull();
  });

  it("opens the complete transit map from the ambient county preview", async () => {
    const onEnterTransitMode = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        response(
          currentFeed({
            vehicles: [
              VEHICLE,
              { ...VEHICLE, vehicleId: "bus-2", routeId: "6155", lat: 39.43 },
            ],
          }),
        ),
      ),
    );

    await act(async () => {
      root.render(
        createElement(LiveBuses, {
          show: true,
          preview: true,
          compactOverview: true,
          overviewZoom: 9.4,
          showInlineStatus: false,
          onEnterTransitMode,
        }),
      );
    });
    await settle();

    const aggregate = container.querySelector<HTMLButtonElement>(
      '[aria-label="2 live buses. Open the transit map for routes and stops."]',
    );
    expect(aggregate).not.toBeNull();
    act(() => aggregate?.click());
    expect(onEnterTransitMode).toHaveBeenCalledOnce();
  });

  it("does not call a delayed aggregate live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        response(
          currentFeed({
            vehicles: [
              VEHICLE,
              { ...VEHICLE, vehicleId: "bus-2", routeId: "6155", lat: 39.43 },
            ],
            feedTimestamp: Math.floor(Date.now() / 1000) - 50,
          }),
        ),
      ),
    );

    await act(async () => {
      root.render(
        createElement(LiveBuses, {
          show: true,
          compactOverview: true,
          overviewZoom: 9.4,
          showInlineStatus: false,
        }),
      );
    });
    await settle();

    const aggregate = container.querySelector<HTMLElement>(
      '[aria-label="2 buses last reported. Feed delayed. Zoom in to see routes."]',
    );
    expect(aggregate).not.toBeNull();
    expect(aggregate?.dataset.delayed).toBe("true");
    expect(aggregate?.textContent).toContain("reported");
    expect(aggregate?.textContent).not.toContain("live");
  });

  it("does not poll in the background and refreshes when the page returns", async () => {
    vi.useFakeTimers();
    visibility = "hidden";
    const fetchMock = vi.fn<typeof fetch>(() =>
      response(currentFeed({ vehicles: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    act(() => root.render(createElement(LiveBuses, { show: true })));
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(30_000));
    expect(fetchMock).not.toHaveBeenCalled();

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ages a previously current feed into a delayed state", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => response(currentFeed()))
      .mockImplementation(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(createElement(LiveBuses, { show: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain("Bus feed delayed");

    act(() => vi.advanceTimersByTime(41_000));
    expect(container.textContent).toContain("Bus feed delayed");
  });
});

describe("LiveBuses visual glide", () => {
  it("caps intermediate React commits while always allowing the final frame", () => {
    const duration = 14_000;
    const displayFrameMs = 1_000 / 60;
    let lastCommitAt = -LIVE_BUS_GLIDE_VISUAL_UPDATE_MS;
    let commits = 0;
    let finalCommitted = false;

    for (let now = 0; now <= duration + displayFrameMs; now += displayFrameMs) {
      const progress = Math.min(1, now / duration);
      if (
        !shouldCommitLiveBusGlideFrame({
          now,
          lastCommitAt,
          progress,
        })
      ) {
        continue;
      }
      commits += 1;
      lastCommitAt = now;
      finalCommitted ||= progress === 1;
    }

    expect(commits).toBeGreaterThan(100);
    expect(commits).toBeLessThan(200);
    expect(finalCommitted).toBe(true);
  });

  it("lands an animated bus on its newest reported position", async () => {
    motionState.reduced = false;
    let now = 1_000;
    let nextFrameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });

    const first = {
      ...VEHICLE,
      routeId: undefined,
      lat: 39.4143,
      lng: -77.4105,
    };
    const latest = {
      ...first,
      lat: 39.4191,
      lng: -77.4032,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() =>
        response(currentFeed({ vehicles: [first] })),
      )
      .mockImplementationOnce(() =>
        response(currentFeed({ vehicles: [latest] })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const runNextFrame = async (timestamp: number) => {
      const entry = frames.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      expect(entry).toBeDefined();
      if (!entry) return;
      frames.delete(entry[0]);
      now = timestamp;
      await act(async () => {
        entry[1](timestamp);
        await Promise.resolve();
      });
    };
    const busMarker = () =>
      container.querySelector('[data-testid="marker"]') as HTMLElement | null;

    await act(async () => {
      root.render(createElement(LiveBuses, { show: true }));
    });
    await settle();
    await runNextFrame(now);
    expect(Number(busMarker()?.dataset.longitude)).toBe(first.lng);
    expect(Number(busMarker()?.dataset.latitude)).toBe(first.lat);

    now = 2_000;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await runNextFrame(2_000);
    await runNextFrame(9_000);
    expect(Number(busMarker()?.dataset.longitude)).not.toBe(latest.lng);
    expect(Number(busMarker()?.dataset.latitude)).not.toBe(latest.lat);

    await runNextFrame(16_000);
    expect(Number(busMarker()?.dataset.longitude)).toBe(latest.lng);
    expect(Number(busMarker()?.dataset.latitude)).toBe(latest.lat);
    expect(frames.size).toBe(0);
  });
});
