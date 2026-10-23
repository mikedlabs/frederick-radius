// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TRANSIT from "@/data/transit.json";
import { CURRENT_TRANSIT_STOPS } from "@/lib/transit-static";
import type { LineFC } from "@/lib/integrations/transitFrederick";
import {
  requestTransitStopFocus,
  requestTransitVehicleFocus,
  takePendingTransitStopFocus,
  TRANSIT_STOP_FOCUS_EVENT,
} from "@/lib/transit-focus";

type MapCallbacks = {
  onClick?: (event: { features: Array<{ layer: { id: string }; geometry: { type: string; coordinates: number[] }; properties: Record<string, string> }> }) => void;
  onLoad?: (event: { target: unknown }) => void;
};
const mocked = vi.hoisted(() => ({
  mapProps: null as MapCallbacks | null,
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  arrivalsStatus: "unavailable",
  savedStops: [] as unknown[],
  savedBuses: [] as unknown[],
}));
vi.mock("react-map-gl/mapbox", async () => {
  const { createElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } = await import("react");
  const map = { fitBounds: mocked.fitBounds, flyTo: mocked.flyTo, easeTo: mocked.flyTo, jumpTo: vi.fn(), getZoom: () => 15, project: ([lng, lat]: number[]) => ({ x: lng, y: lat }) };
  return {
    default: forwardRef(function TestMap(props: MapCallbacks & { children?: ReactNode }, ref) {
      useLayoutEffect(() => { mocked.mapProps = props; }, [props]);
      useImperativeHandle(ref, () => ({ getMap: () => map }), []);
      const initialLoad = useRef(props.onLoad);
      useEffect(() => { initialLoad.current?.({ target: map }); }, []);
      return createElement("div", { "data-test-map": "true" }, props.children);
    }),
    Source: ({ id, data, children }: { id: string; data: unknown; children?: ReactNode }) =>
      createElement("div", { "data-map-source": id, "data-source-payload": JSON.stringify(data) }, children),
    Layer: ({ id }: { id: string }) => createElement("span", { "data-map-layer": id }),
    AttributionControl: () => null,
    Marker: ({ longitude, latitude, children }: { longitude: number; latitude: number; children?: ReactNode }) =>
      createElement("div", { "data-map-marker": "true", "data-lng": longitude, "data-lat": latitude }, children),
    Popup: ({ children, onClose }: { children?: ReactNode; onClose?: () => void }) =>
      createElement("aside", { "data-map-popup": "true" },
        createElement("button", { type: "button", "aria-label": "Close test map preview", onClick: onClose }, "Close"), children),
  };
});
// These mocks remove only Mapbox transport/canvas and unrelated device effects.
// Real TransitMap, StopArrivalsPopup, finder, focus bridge and LiveBuses render.
vi.mock("@/lib/mapbox", () => ({ MAPBOX_TOKEN: "declared-test-token-no-network" }));
vi.mock("@/components/map/mapCameraHelpers", () => ({ hasWebGL: () => true }));
vi.mock("@/components/map/mapboxFieldGuideStyle", () => ({
  applyMapboxFieldGuideConfig: () => undefined,
  installMapboxFieldGuideTerrain: () => undefined,
  MAPBOX_FIELD_GUIDE_CONFIG: {}, MAPBOX_FIELD_GUIDE_STYLE: "test://no-network",
  MAPBOX_LABEL_FONT_MEDIUM: ["test-font"],
}));
vi.mock("@/components/map/markerA11y", () => ({ exposeMarkerChild: () => undefined }));
vi.mock("@/lib/haptics", () => ({ haptic: () => undefined }));
vi.mock("@/lib/motion", () => ({ shouldLimitLiveEffects: () => true }));
vi.mock("@/hooks/useGeolocation", () => ({ useGeolocation: () => ({ state: { status: "idle" }, request: vi.fn() }) }));
vi.mock("./useSavedTransitStops", () => ({ useSavedTransitStops: () => ({ stops: mocked.savedStops, toggle: vi.fn() }) }));
vi.mock("./useSavedTransitBuses", () => ({ useSavedTransitBuses: () => ({ buses: mocked.savedBuses, toggle: vi.fn() }) }));
vi.mock("./useLiveVehicles", () => ({ useLiveVehicles: () => ({ vehicles: [], loaded: true, available: false, status: "unavailable", stale: false }) }));
vi.mock("./useStopArrivals", () => ({ useStopArrivals: () => ({ snapshot: { predictions: [], status: mocked.arrivalsStatus, providerUpdatedAt: null, checkedAt: null }, nowMs: Date.now() }) }));

import TransitMap from "./TransitMap";
import TransitStopFinder from "./TransitStopFinder";

const STOP = CURRENT_TRANSIT_STOPS.find((stop) => stop.id === "162950")!;
const OTHER_STOP = CURRENT_TRANSIT_STOPS.find((stop) => stop.id === "162951")!;
const ROUTE_ID = "6154";
const BUS_ID = "declared-fixture-bus";
const lines = (TRANSIT.shapes as Record<string, number[][]>)[ROUTE_ID];
const shapes: LineFC = {
  type: "FeatureCollection", source: "official-gtfs",
  features: [{ type: "Feature", properties: { routeId: ROUTE_ID }, geometry: { type: "LineString", coordinates: lines.map(([lat, lng]) => [lng, lat]) } }],
};
let container: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.fitBounds.mockReset(); mocked.flyTo.mockReset(); mocked.mapProps = null;
  mocked.arrivalsStatus = "unavailable";
  sessionStorage.clear(); localStorage.clear();
  history.replaceState({ retainedNextState: { key: "preserve" } }, "", `/transit?stop=${STOP.id}&in=county#my-stop-heading`);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: vi.fn() });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input), "https://radius.test");
    const now = Math.floor(Date.now() / 1000);
    if (url.pathname === "/api/transit/vehicles") return Response.json({
      available: true, status: "ok", feedTimestamp: now,
      vehicles: [{ vehicleId: BUS_ID, routeId: ROUTE_ID, tripId: "declared-fixture-trip", lat: 39.4258, lng: -77.4094, timestamp: now, nextStop: STOP }],
    });
    if (url.pathname === "/api/transit/stop-predictions") return Response.json({ available: false, status: "unavailable", predictions: [] });
    throw new Error(`Unexpected request in transit regression: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove();
  Reflect.deleteProperty(navigator, "onLine");
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function render(children: ReactNode) {
  await act(async () => { root.render(children); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => { (element as HTMLElement).click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
}
function button(name: string) { return [...container.querySelectorAll("button")].find((node) => (node.getAttribute("aria-label") ?? node.textContent?.trim()) === name) ?? null; }
async function tapStop(stop = OTHER_STOP, supplied = { name: "Untrusted label", lng: 0, lat: 0 }) {
  await act(async () => mocked.mapProps!.onClick!({ features: [{ layer: { id: "transit-stops-hit" }, geometry: { type: "Point", coordinates: [supplied.lng, supplied.lat] }, properties: { id: stop.id, name: supplied.name } }] }));
}
function map(liveBuses = false) { return <TransitMap shapes={shapes} zoom={15} interactiveStops highlightRoutes liveBuses={liveBuses} showTrains={false} />; }

// Static ids/coordinates above are real. The bus/feed response is an explicitly
// declared fixture. These tests establish interaction contracts, not WebGL,
// Mapbox availability, current bus service or actual 44px painted geometry.
describe("Transit stop-to-map continuity", () => {
  it.each(["unavailable", "stale", "live"])("keeps My stop’s map action available with %s empty arrivals, including offline", async (status) => {
    mocked.arrivalsStatus = status;
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const observed = vi.fn(); window.addEventListener(TRANSIT_STOP_FOCUS_EVENT, observed);
    try {
      await render(<TransitStopFinder />);
      expect(container.querySelector("h3")?.textContent).toBe(STOP.name);
      const show = button("Show stop on map") as HTMLButtonElement;
      expect(show?.disabled).toBe(false);
      await click(show);
      expect(observed).toHaveBeenCalled();
      expect(observed.mock.calls.at(-1)?.[0]).toMatchObject({
        detail: { stopId: STOP.id },
      });
      expect(takePendingTransitStopFocus()).toMatchObject({ stopId: STOP.id });
      expect(new URL(location.href).searchParams.get("stop")).toBe(STOP.id);
    } finally { window.removeEventListener(TRANSIT_STOP_FOCUS_EVENT, observed); }
  });

  it("requires explicit Use this stop before changing My stop and preserves the canonical URL/history metadata", async () => {
    await render(<><TransitStopFinder />{map()}</>);
    await tapStop();
    expect(container.querySelector("h3")?.textContent).toBe(STOP.name);
    expect(new URL(location.href).searchParams.get("stop")).toBe(STOP.id);
    expect(container.textContent).toContain(OTHER_STOP.name);
    expect(container.textContent).not.toContain("Untrusted label");
    await click(button("Use this stop"));
    expect(container.querySelector("h3")?.textContent).toBe(OTHER_STOP.name);
    const url = new URL(location.href);
    expect(url.searchParams.get("stop")).toBe(OTHER_STOP.id);
    expect(url.searchParams.get("in")).toBe("county");
    expect(history.state.retainedNextState).toEqual({ key: "preserve" });
    expect(document.activeElement?.id).toBe("my-stop-heading");
    expect(container.querySelectorAll("[data-map-popup]")).toHaveLength(0);
  });

  it("uses GPU stop layers at close zoom and at most one canonical active HTML stop marker", async () => {
    history.replaceState(null, "", "/transit?in=county");
    await render(map());
    expect(container.querySelector('[data-map-layer="transit-stops-dots"]')).not.toBeNull();
    expect(container.querySelector('[data-map-layer="transit-stops-hit"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-map-marker]")).toHaveLength(0);
    await tapStop();
    const active = container.querySelector(`[data-transit-active-stop="${OTHER_STOP.id}"]`);
    expect(active?.tagName).toBe("BUTTON");
    expect(active?.getAttribute("aria-label")).toBe(`Show arrivals at ${OTHER_STOP.name}`);
    expect(container.querySelectorAll("[data-transit-active-stop]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-map-marker]")).toHaveLength(1);
    const marker = active!.closest("[data-map-marker]");
    expect(Number(marker?.getAttribute("data-lat"))).toBe(OTHER_STOP.lat);
    expect(Number(marker?.getAttribute("data-lng"))).toBe(OTHER_STOP.lng);
    const payload = JSON.parse(container.querySelector('[data-map-source="transit-stops"]')!.getAttribute("data-source-payload")!);
    expect(payload.features).toHaveLength(CURRENT_TRANSIT_STOPS.length);
  });

  it("names the selected stop on the live network card instead of the empty picker prompt", async () => {
    await render(<><TransitStopFinder />{map()}</>);
    const context = container.querySelector("#transit-route-context");
    expect(context?.textContent).toBe(`${STOP.name} is selected.`);
    expect(context?.getAttribute("data-live-network-stop")).toBe(STOP.id);
    expect(container.textContent).not.toContain("Choose a route or select a stop to check arrivals.");
    expect(container.querySelector(`[data-transit-active-stop="${STOP.id}"]`)).not.toBeNull();
    await act(async () => { requestTransitStopFocus({ stopId: OTHER_STOP.id }); });
    expect(container.querySelector("#transit-route-context")?.textContent).toBe(`${OTHER_STOP.name} is selected.`);
    expect(container.querySelector("#transit-route-context")?.getAttribute("data-live-network-stop")).toBe(OTHER_STOP.id);
  });

  it("replays a valid pending stop through canonical coordinates without selecting it for the rider", async () => {
    requestTransitStopFocus({ stopId: OTHER_STOP.id });
    await render(map());
    expect(container.querySelector(`[data-transit-active-stop="${OTHER_STOP.id}"]`)).not.toBeNull();
    expect(takePendingTransitStopFocus()).toBeNull();
    expect(mocked.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [OTHER_STOP.lng, OTHER_STOP.lat], zoom: 15, duration: 0 }));
    expect(new URL(location.href).searchParams.get("stop")).toBe(STOP.id);
  });

  it("does not create an active stop or preview for a nonexistent static stop id", async () => {
    history.replaceState(null, "", "/transit?in=county");
    requestTransitStopFocus({ stopId: "not-a-current-static-stop" });
    await render(map());
    expect(container.querySelectorAll("[data-transit-active-stop]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-map-popup]")).toHaveLength(0);
  });

  it("frames the declared current bus and stop, names the stop control, and opens that exact bus", async () => {
    const detail = { vehicleId: BUS_ID, routeId: ROUTE_ID, bus: { lat: 39.4258, lng: -77.4094 }, stop: { lat: STOP.lat, lng: STOP.lng }, stopId: STOP.id, stopName: STOP.name };
    await render(map(true));
    mocked.fitBounds.mockClear();
    await act(async () => { requestTransitVehicleFocus(detail); });
    expect(mocked.fitBounds).toHaveBeenCalled();
    const [bounds, options] = mocked.fitBounds.mock.calls.at(-1)!;
    for (const point of [detail.bus, detail.stop]) {
      expect(bounds[0][0]).toBeLessThanOrEqual(point.lng);
      expect(bounds[0][1]).toBeLessThanOrEqual(point.lat);
      expect(bounds[1][0]).toBeGreaterThanOrEqual(point.lng);
      expect(bounds[1][1]).toBeGreaterThanOrEqual(point.lat);
    }
    expect(options.duration).toBe(0);
    const stop = container.querySelector(`[data-transit-active-stop="${STOP.id}"]`);
    expect(stop?.tagName).toBe("BUTTON");
    expect(stop?.getAttribute("aria-label")).toBe(`Show arrivals at ${STOP.name}`);
    expect(container.querySelectorAll("[data-map-popup]")).toHaveLength(1);
    expect(container.querySelector("[data-map-popup]")?.textContent).toContain("Save this bus");
    expect(container.querySelectorAll("[data-live-bus-marker]")).toHaveLength(1);
    expect(container.querySelector("[data-live-bus-marker]")?.getAttribute("aria-label")).toContain(`vehicle ${BUS_ID}`);
  });

  it("returns a closed externally focused bus to its connected Track trigger", async () => {
    const detail = { vehicleId: BUS_ID, routeId: ROUTE_ID, bus: { lat: 39.4258, lng: -77.4094 }, stop: { lat: STOP.lat, lng: STOP.lng }, stopId: STOP.id, stopName: STOP.name };
    await render(<><button id="declared-track-trigger" type="button" onClick={() => requestTransitVehicleFocus(detail)}>Track declared fixture bus</button>{map(true)}</>);
    const trigger = document.getElementById("declared-track-trigger")!;
    trigger.focus();
    await click(trigger);
    expect(container.querySelectorAll("[data-map-popup]")).toHaveLength(1);
    await click(button("Close test map preview"));
    expect(container.querySelectorAll("[data-map-popup]")).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
  });

  it("replaces an externally focused real bus popup with one stop preview without reopening that focus", async () => {
    await render(map(true));
    await act(async () => { requestTransitVehicleFocus({ vehicleId: BUS_ID, routeId: ROUTE_ID, bus: { lat: 39.4258, lng: -77.4094 }, stop: { lat: STOP.lat, lng: STOP.lng }, stopId: STOP.id, stopName: STOP.name }); });
    expect(container.querySelectorAll("[data-map-popup]")).toHaveLength(1);
    expect(container.querySelector('[data-map-popup]')?.textContent).toContain("Save this bus");
    await tapStop();
    expect(container.querySelectorAll("[data-map-popup]")).toHaveLength(1);
    expect(container.querySelector('[data-map-popup]')?.textContent).toContain(OTHER_STOP.name);
    await click(button("Close test map preview"));
    expect(container.querySelectorAll("[data-map-popup]")).toHaveLength(0);
    expect(document.activeElement?.getAttribute("data-transit-active-stop")).toBe(OTHER_STOP.id);
    // Re-render after dismissal must not resurrect the previous focus key.
    await render(map(true));
    expect(container.querySelectorAll("[data-map-popup]")).toHaveLength(0);
  });
});
