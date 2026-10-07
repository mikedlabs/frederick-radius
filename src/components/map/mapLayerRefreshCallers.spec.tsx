// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeferredBrowseLayers, MapLayerGroup } from "./deferredBrowseLayers";

const edge = vi.hoisted(() => ({
  mapProps: {} as Record<string, unknown>,
  radiusProps: {} as Record<string, unknown>,
  places: vi.fn(),
  track: vi.fn(),
  params: new URLSearchParams("q=test"),
}));
vi.mock("@/lib/track", () => ({ track: edge.track }));
vi.mock("next/navigation", () => ({ useSearchParams: () => edge.params }));
vi.mock("./mapPlacesClient", () => ({ loadMapPlaces: edge.places, resetMapPlacesRequest: vi.fn() }));
vi.mock("./AppMapClient", () => ({ default: (props: Record<string, unknown>) => { edge.mapProps = props; return null; } }));
vi.mock("./MapLoadingScene", () => ({ default: () => null }));
vi.mock("@/components/radius/RadiusBuilder", () => ({ default: (props: Record<string, unknown>) => { edge.radiusProps = props; return createElement("div", null, props.sourceNotice as ReactNode); } }));

import BrowseMapClient from "./BrowseMapClient";
import DeferredRadiusBuilder from "@/components/radius/DeferredRadiusBuilder";
import { resetMapLayersRequest } from "./mapLayersClient";
import { resetMapPerf } from "./mapPerf";

let root: Root;
let container: HTMLDivElement;
let visibility: DocumentVisibilityState;
let fetchMock: ReturnType<typeof vi.fn>;
const counts = new Map<string, number>();

function groups(): string[] {
  return fetchMock.mock.calls.map(([url]) => new URL(String(url), "https://radius.test").searchParams.get("groups")!);
}
function demand(active: MapLayerGroup[]): void {
  (edge.mapProps.onActiveLayerGroupsChange as (groups: MapLayerGroup[]) => void)(active);
  if (active.length) (edge.mapProps.onLayerDemand as (groups: MapLayerGroup[]) => void)(active);
}
async function flush(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}
async function mountBrowse(): Promise<void> {
  await act(async () => root.render(createElement(BrowseMapClient, {
    dealSlugsToday: [], countyBoundary: { type: "FeatureCollection", features: [] }, transitStops: [], marcStations: [],
  })));
  await flush();
}

beforeEach(() => {
  resetMapPerf();
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(1);
  edge.track.mockClear();
  vi.setSystemTime(new Date("2026-10-06T20:00:00Z"));
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  edge.mapProps = {}; edge.radiusProps = {}; edge.places.mockReset().mockResolvedValue({ places: [] });
  counts.clear();
  fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const group = new URL(url, "https://radius.test").searchParams.get("groups")!;
    const count = (counts.get(group) ?? 0) + 1; counts.set(group, count);
    return new Response(JSON.stringify({
      sourceHealth: { [group]: { status: "current", unavailable: [], asOf: new Date().toISOString() } },
      ...(group === "signals" ? { smartSignals: { conditionsStatus: "current", activeWeatherAlert: false, marketsOpenTodayCount: count, roadsTrendingLongerCount: 0 } } : {}),
      ...(group === "parking" ? { parking: [{ id: "garage", name: "Garage", lng: -77.41, lat: 39.41, available: count }] } : {}),
      ...(group === "events" ? { weekEvents: [{ slug: `event-${count}`, title: `Event ${count}`, starts_at: "2026-10-06T21:00:00Z", lng: -77.41, lat: 39.41 }] } : {}),
    }));
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); resetMapPerf(); resetMapLayersRequest();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("Map refresh through its real callers", () => {
  it.each([{ random: 0, sampled: true }, { random: 1, sampled: false }])(
    "keeps all fetch assertions about layer work when telemetry sampled=$sampled",
    async ({ random, sampled }) => {
      vi.mocked(Math.random).mockReturnValue(random);
      await mountBrowse();
      // Keep the real source/performance caller: only outbound analytics is a boundary mock.
      expect(groups()).toEqual(["context", "signals"]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(edge.track).toHaveBeenCalledTimes(sampled ? 2 : 0);
      if (sampled) {
        for (const [event, props] of edge.track.mock.calls) {
          expect(event).toBe("map_source_timing");
          expect(props).toMatchObject({ source: "other" });
        }
      }
    },
  );
  it("waits for the usable place map before starting optional source work", async () => {
    edge.places.mockReturnValue(new Promise(() => {}));
    await mountBrowse();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_100); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes only active operational groups and stops polling a disabled layer", async () => {
    await mountBrowse();
    expect(groups()).toEqual(["context", "signals"]);
    await act(async () => demand(["parking", "outdoors"])); await flush();
    expect(groups()).toEqual(["context", "signals", "parking", "outdoors"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_100); });
    expect(groups().slice(4)).toEqual(["parking", "signals"]);
    expect((edge.mapProps.parking as { available: number }[])[0].available).toBe(2);
    await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("pageshow")); });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    await act(async () => demand([]));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(groups().slice(6)).toEqual(["signals"]);
    expect(groups().filter((group) => group === "context" || group === "outdoors")).toEqual(["context", "outdoors"]);
  });

  it("does no hidden work and updates expired active evidence once on return", async () => {
    await mountBrowse();
    await act(async () => demand(["parking"])); await flush();
    await act(async () => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(180_100); window.dispatchEvent(new Event("focus")); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await act(async () => {
      visibility = "visible"; document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pageshow")); window.dispatchEvent(new Event("focus"));
    });
    expect(groups().slice(3)).toEqual(["parking", "signals"]);
    expect((edge.mapProps.parking as { available: number }[])[0].available).toBe(2);
  });

  it("propagates retained older evidence after failure and permits an explicit recovery", async () => {
    await mountBrowse();
    await act(async () => demand(["parking"])); await flush();
    fetchMock.mockImplementationOnce(async () => { throw new Error("offline"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_100); });
    const health = edge.mapProps.mapLayerSourceHealth as DeferredBrowseLayers["sourceHealth"];
    expect(health.parking).toMatchObject({ status: "partial", stale: true, asOf: "2026-10-06T20:00:00.000Z" });
    expect((edge.mapProps.parking as { available: number }[])[0].available).toBe(1);
    await act(async () => (edge.mapProps.onLayerDemand as (groups: MapLayerGroup[]) => void)(["parking"]));
    expect((edge.mapProps.mapLayerSourceHealth as DeferredBrowseLayers["sourceHealth"]).parking?.stale).not.toBe(true);
    expect((edge.mapProps.parking as { available: number }[])[0].available).toBe(2);
  });

  it("renders legacy Radius failure with the retained event timestamp and a working retry", async () => {
    await act(async () => root.render(createElement(DeferredRadiusBuilder))); await flush();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300_100); });
    const notice = container.querySelector('[role="status"]');
    expect(notice?.textContent).toContain("could not be updated");
    expect(notice?.textContent).toContain("Last snapshot: Oct 6, 4:00 PM.");
    expect((edge.radiusProps.events as { title: string }[])[0].title).toBe("Event 1");
    await act(async () => (notice!.querySelector("button") as HTMLButtonElement).click());
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect((edge.radiusProps.events as { title: string }[])[0].title).toBe("Event 2");
  });

  it("distinguishes a first unavailable Radius snapshot from an empty nearby result", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await act(async () => root.render(createElement(DeferredRadiusBuilder))); await flush();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("An empty result does not mean nothing is nearby.");
    expect(container.querySelector('[role="status"]')?.textContent).not.toContain("Last snapshot:");
  });

  it("keeps the radius caller's event and amenity intervals separate from stable context", async () => {
    await act(async () => root.render(createElement(DeferredRadiusBuilder))); await flush();
    expect(groups()).toEqual(["amenities", "events", "context"]);
    expect((edge.radiusProps.events as { title: string }[])[0].title).toBe("Event 1");
    await act(async () => { await vi.advanceTimersByTimeAsync(300_100); });
    expect(counts.get("events")).toBe(2); expect(counts.get("amenities")).toBe(1); expect(counts.get("context")).toBe(1);
    expect((edge.radiusProps.events as { title: string }[])[0].title).toBe("Event 2");
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(counts.get("events")).toBe(4); expect(counts.get("amenities")).toBe(2); expect(counts.get("context")).toBe(1);
  });
});
