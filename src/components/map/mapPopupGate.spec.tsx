// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveLayerGate } from "./liveLayerGate";

vi.mock("react-map-gl/mapbox", () => ({
  Marker: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "marker" }, children),
  Popup: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "popup" }, children),
  Source: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "source" }, children),
  Layer: () => null,
}));

vi.mock("./markerA11y", () => ({
  exposeMarkerChild: () => undefined,
}));

vi.mock("@/lib/haptics", () => ({
  haptic: () => undefined,
}));

import LiveRotorcraft from "./LiveRotorcraft";
import TrafficCameras from "./TrafficCameras";

let container: HTMLDivElement;
let root: Root;
let closers: Set<() => void>;
let gate: LiveLayerGate;

function response(body: object): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  } as Response);
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function click(element: Element | null): void {
  expect(element).not.toBeNull();
  act(() => {
    element?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function closeFromRegistry(): void {
  act(() => {
    for (const close of closers) close();
  });
}

function pressEscape(): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  closers = new Set();
  gate = {
    register: vi.fn((close: () => void) => {
      closers.add(close);
      return () => closers.delete(close);
    }),
    onWillOpen: vi.fn(() => {
      for (const close of closers) close();
    }),
    onDidClose: vi.fn(),
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AppMap popup gate coverage", () => {
  it("passes the shared gate to the traffic-camera layer", () => {
    const appMap = readFileSync("src/components/map/AppMap.tsx", "utf8");
    const start = appMap.indexOf("<TrafficCameras");
    const end = appMap.indexOf("/>", start);
    const trafficCameraMount = appMap.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(trafficCameraMount).toContain("gate={liveLayerGate}");
    expect(appMap).toContain("liveLayerClosersRef.current.closeAll()");
  });

  it("closes a traffic-camera popup through Back's registry clear and Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        response({
          cameras: [
            {
              id: "chart-15",
              name: "US 15 at Rosemont Avenue",
              lng: -77.427,
              lat: 39.424,
              videoUrl: "https://example.test/chart-15",
              route: 15,
              updatedAt: "2026-08-22T12:00:00.000Z",
            },
          ],
        }),
      ),
    );

    await act(async () => {
      root.render(createElement(TrafficCameras, { show: true, gate }));
    });
    await settle();

    const camera = () =>
      container.querySelector('button[aria-label^="Traffic camera:"]');
    click(camera());
    expect(gate.onWillOpen).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="popup"]')).not.toBeNull();
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="https://example.test/chart-15"]',
      )?.classList.contains("min-h-11"),
    ).toBe(true);
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="/cameras?camera=chart-15"]',
      )?.classList.contains("min-h-11"),
    ).toBe(true);

    closeFromRegistry();
    expect(container.querySelector('[data-testid="popup"]')).toBeNull();
    expect(gate.onDidClose).not.toHaveBeenCalled();

    click(camera());
    expect(container.querySelector('[data-testid="popup"]')).not.toBeNull();
    pressEscape();
    expect(container.querySelector('[data-testid="popup"]')).toBeNull();
    expect(gate.onDidClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses traffic-camera history when the layer is hidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        response({
          cameras: [
            {
              id: "chart-15",
              name: "US 15 at Rosemont Avenue",
              lng: -77.427,
              lat: 39.424,
              videoUrl: "https://example.test/chart-15",
              route: 15,
              updatedAt: "2026-08-22T12:00:00.000Z",
            },
          ],
        }),
      ),
    );

    await act(async () => {
      root.render(createElement(TrafficCameras, { show: true, gate }));
    });
    await settle();

    click(container.querySelector('button[aria-label^="Traffic camera:"]'));
    expect(container.querySelector('[data-testid="popup"]')).not.toBeNull();

    await act(async () => {
      root.render(createElement(TrafficCameras, { show: false, gate }));
    });
    await settle();

    expect(container.querySelector('[data-testid="popup"]')).toBeNull();
    expect(gate.onDidClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(createElement(TrafficCameras, { show: true, gate }));
    });
    expect(container.querySelector('[data-testid="popup"]')).toBeNull();
  });

  it("registers both rotorcraft popup states and closes the FMH popup through Back and Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined)),
    );

    await act(async () => {
      root.render(createElement(LiveRotorcraft, { show: true, gate }));
    });

    const heliport = () =>
      container.querySelector(
        'button[aria-label^="Frederick Health Hospital Heliport"]',
      );
    click(heliport());
    expect(gate.onWillOpen).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      "Frederick Health Hospital Heliport · 7MD3",
    );

    closeFromRegistry();
    expect(container.textContent).not.toContain(
      "Frederick Health Hospital Heliport · 7MD3",
    );
    expect(gate.onDidClose).not.toHaveBeenCalled();

    click(heliport());
    expect(container.textContent).toContain(
      "Frederick Health Hospital Heliport · 7MD3",
    );
    pressEscape();
    expect(container.textContent).not.toContain(
      "Frederick Health Hospital Heliport · 7MD3",
    );
    expect(gate.onDidClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses rotorcraft history when its visible layer becomes a quiet probe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined)),
    );

    await act(async () => {
      root.render(createElement(LiveRotorcraft, { show: true, probe: true, gate }));
    });
    click(
      container.querySelector(
        'button[aria-label^="Frederick Health Hospital Heliport"]',
      ),
    );
    expect(container.querySelector('[data-testid="popup"]')).not.toBeNull();

    await act(async () => {
      root.render(createElement(LiveRotorcraft, { show: false, probe: true, gate }));
    });
    await settle();

    expect(container.querySelector('[data-testid="popup"]')).toBeNull();
    expect(gate.onDidClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(createElement(LiveRotorcraft, { show: true, probe: true, gate }));
    });
    expect(container.querySelector('[data-testid="popup"]')).toBeNull();
  });

  it("dismisses rotorcraft history when a refreshed signal disappears", async () => {
    const observedSignal = {
      id: "daily-public-id",
      lat: 39.42,
      lng: -77.41,
      aircraftType: "H60",
      altitudeFt: 1_200,
      groundSpeedKt: 80,
      reportAgeSeconds: 12,
      rotorcraftEvidence: "icao-type" as const,
    };
    const snapshot = (signals: typeof observedSignal[]) => ({
      observationCount: signals.length,
      signals,
      trooperAirborneCount: 0,
      fmhActivity: {
        possibleArrivalCount: 0,
        possibleDepartureCount: 0,
        helicopterNearbyCount: 0,
      },
      observedAt: "2026-08-22T12:00:00.000Z",
      receivedAt: "2026-08-22T12:00:01.000Z",
      available: true,
      coverage: "incomplete",
      source: "ADSB.lol",
      attribution: "Aircraft observations © ADSB.lol contributors, ODbL 1.0",
      sourceUrl: "https://adsb.lol",
      licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
      note: "Public reception is incomplete.",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => response(snapshot([observedSignal])))
      .mockImplementation(() => response(snapshot([])));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(createElement(LiveRotorcraft, { show: true, gate }));
    });
    await settle();

    click(
      container.querySelector(
        'button[aria-label^="Approximate public helicopter observation"]',
      ),
    );
    expect(container.querySelector('[data-testid="popup"]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="popup"]')).toBeNull();
    expect(gate.onDidClose).toHaveBeenCalledTimes(1);
  });

  it("keeps FMH activity useful without running the sweep for reduced-motion viewers", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    const snapshot = (possibleArrivalCount: number) => ({
      observationCount: possibleArrivalCount,
      signals: [],
      trooperAirborneCount: 0,
      fmhActivity: {
        possibleArrivalCount,
        possibleDepartureCount: 0,
        helicopterNearbyCount: 0,
      },
      observedAt: "2026-08-22T12:00:00.000Z",
      receivedAt: "2026-08-22T12:00:01.000Z",
      available: true,
      coverage: "incomplete",
      source: "ADSB.lol",
      attribution: "Aircraft observations © ADSB.lol contributors, ODbL 1.0",
      sourceUrl: "https://adsb.lol",
      licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
      note: "Public reception is incomplete.",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => response(snapshot(0)))
      .mockImplementation(() => response(snapshot(1)));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(createElement(LiveRotorcraft, { show: true, gate }));
    });
    await settle();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-fmh-sweep]")).toBeNull();

    const heliport = container.querySelector(
      'button[aria-label^="Possible FMH helicopter arrival activity"]',
    );
    expect(heliport).not.toBeNull();
    expect(heliport?.textContent).toContain("1");

    click(heliport);
    expect(container.textContent).toContain("1 possible arrival");
  });
});
