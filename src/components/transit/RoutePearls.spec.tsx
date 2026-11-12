// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveVehiclesSnap } from "./useLiveVehicles";

const mocked = vi.hoisted(() => ({ snapshot: null as unknown as LiveVehiclesSnap }));
vi.mock("./useLiveVehicles", () => ({ useLiveVehicles: () => mocked.snapshot }));
vi.mock("./routeGeometry", () => ({
  fractionAlong: () => 0.5,
  pearlsFor: () => [{ id: "a", name: "Mapped A", frac: 0 }, { id: "b", name: "Mapped B", frac: 0.5 }, { id: "c", name: "Mapped C", frac: 1 }],
  stopSequenceFor: () => [{ id: "a", name: "Mapped A", frac: 0 }, { id: "b", name: "Mapped B", frac: 0.5 }, { id: "c", name: "Mapped C", frac: 1 }],
}));
import RoutePearls from "./RoutePearls";

let host: HTMLDivElement;
let root: Root;
const NOW = Date.parse("2026-10-23T12:00:00Z");
function state(overrides: Partial<LiveVehiclesSnap> = {}): LiveVehiclesSnap {
  return {
    vehicles: [], loaded: true, available: true, status: "ok", predictionsAvailable: true,
    fetchedAt: NOW, feedTimestamp: NOW / 1000, stale: false, ...overrides,
  };
}
function bus() {
  return { vehicleId: "v1", routeId: "6154", tripId: "t1", lat: 39.4, lng: -77.4,
    nextStop: { id: "b", name: "Predicted next stop", lat: 39.4, lng: -77.4, etaEpoch: NOW / 1000 + 300 } };
}
async function render(snapshot: LiveVehiclesSnap) {
  mocked.snapshot = snapshot;
  await act(async () => { root.render(createElement(RoutePearls)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  return host.textContent || "";
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network access"); }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("RoutePearls reporting truth", () => {
  it("stays quiet before the first answer", async () => {
    expect(await render(state({ loaded: false }))).toBe("");
  });
  it("does not turn an unavailable feed into a no-service assertion", async () => {
    const text = await render(state({ available: false, status: "unavailable", predictionsAvailable: false }));
    expect(text).toContain("Live bus positions are unavailable.");
    expect(text).toContain("No current bus position can be confirmed.");
    expect(text).not.toContain("No buses are reporting right now.");
    expect(host.querySelector(".pulse-dot")).toBeNull();
  });
  it("labels a healthy empty feed as no reporting buses, not no buses on the road", async () => {
    const text = await render(state());
    expect(text).toContain("No buses are reporting right now.");
    expect(text).not.toContain("No buses are on the road");
    expect(text).not.toContain("unavailable");
  });
  it("uses fresh predictions for the resolved next-stop countdown", async () => {
    const text = await render(state({ vehicles: [bus()] }));
    expect(text).toContain("Predicted next stop"); expect(text).toContain("5 min");
    expect(text).toContain("1 route with reports");
    expect((host.querySelector('[data-reported-bus="v1"]') as HTMLElement).style.opacity).toBe("1");
  });
  it("retains delayed dots without next-stop countdowns or animated live cues, then recovers", async () => {
    let text = await render(state({ vehicles: [bus()], stale: true }));
    expect(text).toContain("Bus reports are delayed."); expect(text).not.toContain("Predicted next stop");
    expect(text).not.toContain("5 min"); expect(host.querySelector(".pulse-dot")).toBeNull();
    expect(host.querySelector(".live-dot")).toBeNull();
    expect(host.querySelector('[data-route-schematic="6154"]')).not.toBeNull();
    text = await render(state({ vehicles: [bus()] }));
    expect(text).toContain("Predicted next stop"); expect(text).not.toContain("Bus reports are delayed.");
  });
  it.each([
    { status: "degraded" as const, predictionsAvailable: false },
    { status: "ok" as const, predictionsAvailable: false },
  ])("keeps positions useful when predictions are not trustworthy ($status)", async (flags) => {
    const text = await render(state({ ...flags, vehicles: [bus()] }));
    expect(text).toContain("Arrival estimates are unavailable.");
    expect(text).not.toContain("Predicted next stop"); expect(text).not.toContain("5 min");
    expect(host.querySelector('[data-route-schematic="6154"]')).not.toBeNull();
  });
  it.each([NOW / 1000 - 120, NOW - 120_000])("does not refresh an old individual vehicle fix with a fresh feed header (%s)", async (timestamp) => {
    const text = await render(state({ vehicles: [{ ...bus(), timestamp }] }));
    expect(text).not.toContain("Predicted next stop"); expect(text).not.toContain("5 min");
    expect((host.querySelector('[data-reported-bus="v1"]') as HTMLElement).style.opacity).toBe("0.5");
    expect(host.querySelector(".live-dot")).toBeNull();
  });
  it("does not mislabel a reporting vehicle with an unknown route as an empty feed", async () => {
    const text = await render(state({ vehicles: [{ ...bus(), routeId: "unknown" }] }));
    expect(text).toContain("Bus reports are available, but their routes cannot be drawn.");
    expect(text).not.toContain("No buses are reporting right now.");
  });
  it("scrubs mapped-stop names without converting geometric proximity into service order", async () => {
    await render(state({ vehicles: [bus()] }));
    const diagram = host.querySelector('[data-route-schematic="6154"]') as HTMLDivElement;
    diagram.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    await act(async () => { diagram.dispatchEvent(new MouseEvent("pointerdown", { clientX: 50, bubbles: true })); });
    const text = host.textContent || "";
    expect(text).toContain("Mapped B"); expect(text).toContain("Mapped stop · schematic");
    expect(text).not.toContain("bus here now"); expect(text).not.toMatch(/bus ~\d+ stops? away|stop \d+ of \d+/);
  });
});
