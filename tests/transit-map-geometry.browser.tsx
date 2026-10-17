/**
 * Opt-in real-engine fixture geometry proof. Run from the repository with:
 * npx vitest run --config=vitest.transit-geometry.config.ts
 * Ordinary unit/release globs omit this file. Cache and evidence use the OS
 * temporary directory unless overridden in the portable geometry config.
 * Local data and documented Mapbox testMode do not certify the public basemap,
 * provider access, rendered cartography, live positions, or production CSP.
 */
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { transitGeometryEngine as engine } from "./fixtures/transit-map-geometry-engine";
import type { LineFC } from "@/lib/integrations/transitFrederick";
import TRANSIT from "@/data/transit.json";
import { CURRENT_TRANSIT_STOPS } from "@/lib/transit-static";
import TransitMap from "@/components/transit/TransitMap";
import { TRANSIT_STOP_FOCUS_EVENT, type TransitStopFocusDetail } from "@/lib/transit-focus";
import "@/app/globals.css";

// The opt-in geometry config aliases only Mapbox's library entry to the
// test-only constructor adapter. React-map-gl and its controls stay real.
// The non-credential value satisfies the app's explicit configuration guard.
// The fixture constructor adapter supplies no account token to the engine.
vi.mock("@/lib/mapbox", () => ({ MAPBOX_TOKEN: "declared-local-geometry-fixture" }));
vi.mock("@/components/map/mapboxFieldGuideStyle", () => ({
  MAPBOX_FIELD_GUIDE_STYLE: {
    version: 8,
    glyphs: `${location.origin}/basemap/fonts/{fontstack}/{range}.pbf`,
    sources: {},
    layers: [{ id: "fixture-background", type: "background", paint: { "background-color": "#FFFFFF" } }],
  },
  MAPBOX_FIELD_GUIDE_CONFIG: {},
  MAPBOX_LABEL_FONT_MEDIUM: ["Noto Sans Medium"],
  MAPBOX_LABEL_FONT_REGULAR: ["Noto Sans Regular"],
  applyMapboxFieldGuideConfig: () => undefined,
  installMapboxFieldGuideTerrain: () => undefined,
}));

type Fixture = {
  stop: { id: string; name: string; lat: number; lng: number };
  vehicle: { id: string; routeId: string; lat: number; lng: number };
  epochSeconds: number;
};
type Ledger = {
  fixtureRequests: Array<{ path: string; method: string }>;
  rejectedExternal: string[];
  rejectedWrites: string[];
  unexpectedLocalApi: string[];
};
const transport = commands as typeof commands & {
  installTransitGeometryTransport(fixture: Fixture): Promise<void>;
  readTransitGeometryLedger(): Promise<Ledger>;
  recordTransitGeometryEvidence(name: string, proof: Record<string, unknown>): Promise<string>;
};

const STOP = CURRENT_TRANSIT_STOPS.find((stop) => stop.id === "162950")!;
const ROUTE_ID = "6154";
const BUS_ID = "declared-geometry-fixture-bus";
const points = (TRANSIT.shapes as Record<string, number[][]>)[ROUTE_ID];
const shapes: LineFC = {
  type: "FeatureCollection", source: "official-gtfs",
  features: [{ type: "Feature", properties: { routeId: ROUTE_ID }, geometry: {
    type: "LineString", coordinates: points.map(([lat, lng]) => [lng, lat]),
  } }],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let originalUrl = "";
let evidenceName = "uninitialized";
let fixture: Fixture | null = null;
let stopSelectionAction: ReturnType<typeof markerGeometry> | null = null;
let emittedStopSelections: TransitStopFocusDetail[] = [];
const captureStopSelection = (event: Event) => {
  emittedStopSelections.push((event as CustomEvent<TransitStopFocusDetail>).detail);
};

function markerGeometry(node: HTMLButtonElement) {
  const box = node.getBoundingClientRect();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const probes = [[x, y], [x - 21.5, y], [x + 21.5, y], [x, y - 21.5], [x, y + 21.5]];
  return {
    name: node.getAttribute("aria-label"),
    rect: { x: box.x, y: box.y, width: box.width, height: box.height },
    probes: probes.map(([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return { x: px, y: py, ownTarget: hit === node || Boolean(hit && node.contains(hit)), hitName: hit?.closest("button")?.getAttribute("aria-label") ?? hit?.tagName ?? null };
    }),
  };
}

function assertTarget(node: HTMLButtonElement) {
  const geometry = markerGeometry(node);
  expect(geometry.rect.width).toBeGreaterThanOrEqual(44);
  expect(geometry.rect.height).toBeGreaterThanOrEqual(44);
  expect(geometry.probes.every((probe) => probe.ownTarget), JSON.stringify(geometry)).toBe(true);
}

beforeEach(() => {
  engine.map = null; engine.errors = []; engine.testModeApplied = false;
  stopSelectionAction = null; emittedStopSelections = [];
  window.addEventListener(TRANSIT_STOP_FOCUS_EVENT, captureStopSelection);
  originalUrl = location.href;
  const url = new URL(originalUrl);
  url.searchParams.set("stop", STOP.id);
  history.replaceState(history.state, "", url);
  document.documentElement.dataset.appearance = "light";
  document.body.style.margin = "0";
  localStorage.removeItem("fr.transit.saved-buses.v1");
  localStorage.removeItem("fr.transit.saved-stops.v1");
});

afterEach(async () => {
  const map = engine.map;
  const proof: Record<string, unknown> = {
    scope: "Real-engine local-fixture projection and DOM hit geometry only; public basemap, production credentials, cartographic appearance and live feeds unverified.",
    viewport: { width: innerWidth, height: innerHeight },
    fixture,
    stopSelectionAction,
    emittedStopSelections,
    mapErrors: [...engine.errors],
    mapReady: Boolean(map?.isStyleLoaded()),
    documentedTestModeApplied: engine.testModeApplied,
    canvas: map ? { width: map.getCanvas().width, height: map.getCanvas().height } : null,
    projectedStop: map ? map.project([STOP.lng, STOP.lat]) : null,
    markers: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-transit-active-stop], [data-live-bus-marker]")).map(markerGeometry),
  };
  try {
    await transport.recordTransitGeometryEvidence(evidenceName, proof);
  } finally {
    window.removeEventListener(TRANSIT_STOP_FOCUS_EVENT, captureStopSelection);
    root?.unmount();
    root = null; container?.remove(); container = null;
    history.replaceState(history.state, "", originalUrl);
  }
  const network = await transport.readTransitGeometryLedger();
  expect(network.rejectedExternal, "Any attempted provider request invalidates this offline fixture harness.").toEqual([]);
  expect(network.rejectedWrites).toEqual([]);
  expect(network.unexpectedLocalApi).toEqual([]);
  expect(engine.errors).toEqual([]);
});

for (const width of [320, 390]) {
  describe(`${width}px actual Mapbox-engine fixture geometry`, () => {
    for (const colocated of [false, true]) {
      it(`${colocated ? "co-located" : "separated control"} bus and active stop retain independently reachable 44px targets`, async () => {
        evidenceName = `${width}-${colocated ? "colocated" : "separated"}`;
        fixture = {
          stop: { id: STOP.id, name: STOP.name, lat: STOP.lat, lng: STOP.lng },
          vehicle: { id: BUS_ID, routeId: ROUTE_ID, lat: STOP.lat, lng: STOP.lng + (colocated ? 0 : 0.0025) },
          epochSeconds: Math.floor(Date.now() / 1000),
        };
        await page.viewport(width, width === 320 ? 568 : 844);
        await transport.installTransitGeometryTransport(fixture);
        container = document.createElement("div");
        container.dataset.transitGeometryFrame = "true";
        container.style.cssText = "width:100%; min-width:0; padding:0;";
        document.body.append(container);
        root = createRoot(container);
        root.render(<TransitMap
          shapes={shapes}
          center={[STOP.lng, STOP.lat]}
          zoom={14.5}
          height={380}
          liveBuses
          interactiveStops
          showTrains={false}
          hideBadge
        />);
        await expect.poll(() => engine.map?.isStyleLoaded(), { timeout: 10_000 }).toBe(true);
        const map = engine.map!;
        expect(engine.testModeApplied).toBe(true);
        await expect.poll(() => map.isSourceLoaded("transit-routes"), { timeout: 10_000 }).toBe(true);
        expect(map.getLayer("transit-routes-line")?.type).toBe("line");
        // Documented testMode does not paint source tiles. Verify the public
        // registered source/layer contract and original geographic input instead.
        const routeSource = map.getStyle()?.sources?.["transit-routes"];
        expect(routeSource?.type).toBe("geojson");
        if (routeSource?.type !== "geojson") throw new Error("Missing actual route GeoJSON source.");
        expect(routeSource.data).toMatchObject({ type: "FeatureCollection", features: [{
          geometry: { type: "LineString", coordinates: points.map(([lat, lng]) => [lng, lat]) },
        }] });
        expect(map.getLayer("transit-stops-dots")?.type).toBe("circle");
        const stopsSource = map.getStyle()?.sources?.["transit-stops"];
        expect(stopsSource?.type).toBe("geojson");
        if (stopsSource?.type !== "geojson" || typeof stopsSource.data === "string") {
          throw new Error("Missing actual inline stop GeoJSON source.");
        }
        const canonicalStop = (stopsSource.data as GeoJSON.FeatureCollection<GeoJSON.Point>).features
          .find((feature) => feature.properties?.id === STOP.id);
        expect(canonicalStop?.geometry.coordinates).toEqual([STOP.lng, STOP.lat]);
        const projected = map.project([STOP.lng, STOP.lat]);
        expect(Number.isFinite(projected.x) && Number.isFinite(projected.y)).toBe(true);
        expect(map.getCanvas().getContext("webgl2")).toBeInstanceOf(WebGL2RenderingContext);
        await expect.poll(() => document.querySelectorAll("[data-live-bus-marker]").length).toBe(1);
        const stop = document.querySelector<HTMLButtonElement>(`[data-transit-active-stop="${STOP.id}"]`)!;
        const bus = document.querySelector<HTMLButtonElement>("[data-live-bus-marker]")!;
        expect(stop).not.toBeNull();
        expect(bus).not.toBeNull();
        await document.fonts.ready;
        assertTarget(stop);
        assertTarget(bus);
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
        await page.elementLocator(bus).click();
        await expect.poll(() => document.querySelectorAll(".mapboxgl-popup").length).toBe(1);
        expect(document.querySelector(".mapboxgl-popup")?.textContent).toContain("Save this bus");
        await userEvent.keyboard("{Escape}");
        await expect.poll(() => document.querySelectorAll(".mapboxgl-popup").length).toBe(0);
        stop.focus();
        await userEvent.keyboard("{Enter}");
        await expect.poll(() => document.querySelectorAll(".mapboxgl-popup").length).toBe(1);
        expect(document.querySelector(".mapboxgl-popup")?.textContent).toContain(STOP.name);
        const useStop = Array.from(document.querySelectorAll<HTMLButtonElement>(".mapboxgl-popup button"))
          .find((button) => button.textContent?.trim() === "Use this stop")!;
        expect(useStop).toBeDefined();
        stopSelectionAction = markerGeometry(useStop);
        assertTarget(useStop);
        await page.elementLocator(useStop).click();
        await expect.poll(() => emittedStopSelections.length).toBe(1);
        expect(emittedStopSelections[0]).toMatchObject({ stopId: STOP.id, selectForRider: true });
        await expect.poll(() => document.querySelectorAll(".mapboxgl-popup").length).toBe(0);
        // Selecting a stop hands off to My stop in the full app. Reopen here
        // so the independent Escape/focus contract remains covered as before.
        stop.focus();
        await userEvent.keyboard("{Enter}");
        await expect.poll(() => document.querySelectorAll(".mapboxgl-popup").length).toBe(1);
        await userEvent.keyboard("{Escape}");
        await expect.poll(() => document.querySelectorAll(".mapboxgl-popup").length).toBe(0);
        await expect.poll(() => document.activeElement === stop).toBe(true);
      });
    }
  });
}
