// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardData } from "@/lib/loaders/places";
import { PLACE_LOOKUP_TIMEOUT_MS } from "@/lib/place-sheet-lookup";

const harness = vi.hoisted(() => ({
  pathname: "/today/tonight",
  push: vi.fn(),
  recent: vi.fn(),
  leave: vi.fn((_id: string, next: () => void) => next()),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => harness.pathname,
  useRouter: () => ({ push: harness.push }),
}));
vi.mock("@/hooks/useRecentPlaces", () => ({ usePushRecentPlace: () => harness.recent }));
vi.mock("@/hooks/useGeolocation", () => ({ readCachedGeoPosition: () => null }));
vi.mock("@/lib/geo", () => ({
  isInFrederickCountyArea: () => true,
  isValidCoord: (point?: { lng: number; lat: number }) => Boolean(point && Number.isFinite(point.lng) && Number.isFinite(point.lat)),
  haversineMeters: () => 123,
}));
vi.mock("@/hooks/useReversibleHistoryLayer", () => ({ navigateAfterHistoryLayer: harness.leave }));
vi.mock("@/components/ui/LazySheetFallback", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">Loading place details<button onClick={onClose}>Cancel lookup</button></div>
  ),
}));
vi.mock("./PlaceSheet", () => ({
  default: ({ place, mapReturnTo, metadataPending, metadataUnavailable, historyLayerId, onClose, travelOrigin, returnFocusRef }: { place: PlaceCardData; mapReturnTo: string; metadataPending: boolean; metadataUnavailable: boolean; historyLayerId: string; onClose: () => void; travelOrigin: unknown; returnFocusRef: { current: HTMLElement | null } }) => (
    <div role="dialog" data-return-to={mapReturnTo} data-metadata-pending={metadataPending} data-metadata-unavailable={metadataUnavailable} data-history-layer={historyLayerId} data-origin={JSON.stringify(travelOrigin)} data-opener={returnFocusRef.current?.id}>
      {place.name}<button onClick={onClose}>Close details</button>
    </div>
  ),
}));

import { PlaceSheetProvider, usePlaceSheet } from "./PlaceSheetProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const origin = "/today/tonight?intent=pizza&in=brunswick";
const placeRecord = (slug: string, name: string) => ({
  slug, name, category: "restaurant", municipality: "frederick",
  geom: { lng: -77.4, lat: 39.4 }, open_status: { state: "unknown" },
} as PlaceCardData);
function Actions() {
  const { openSheetBySlug, closeSheet } = usePlaceSheet();
  return <>
    <button onClick={() => openSheetBySlug("first-place")}>First</button>
    <button onClick={() => openSheetBySlug("second-place")}>Second</button>
    <button id="map-first" onClick={event => openSheetBySlug("first-place", { initialPlace: placeRecord("first-place", "Known first"), returnFocus: event.currentTarget, travelOrigin: { lng: -77.41, lat: 39.41, timestamp: Date.now() } })}>Map first</button>
    <button onClick={() => openSheetBySlug("second-place", { initialPlace: placeRecord("second-place", "Known second") })}>Map second</button>
    <button onClick={closeSheet}>Close</button>
  </>;
}

describe("on-demand place sheet recovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  let unmounted: boolean;

  beforeEach(async () => {
    vi.useFakeTimers();
    harness.pathname = "/today/tonight";
    harness.push.mockClear();
    harness.recent.mockClear();
    harness.leave.mockClear();
    window.history.replaceState({}, "", origin);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    unmounted = false;
    await render();
  });

  afterEach(async () => {
    if (!unmounted) await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function render() {
    await act(async () => root.render(<PlaceSheetProvider><Actions /></PlaceSheetProvider>));
  }
  async function click(text: string) {
    const button = [...container.querySelectorAll("button")].find((node) => node.textContent === text)!;
    await act(async () => button.click());
  }

  it("leaves a hung lookup through the canonical page with the exact Tonight return path", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    await click("First");
    expect(container.textContent).toContain("Loading place details");
    await act(async () => { await vi.advanceTimersByTimeAsync(PLACE_LOOKUP_TIMEOUT_MS); });
    expect(signal?.aborted).toBe(true);
    expect(container.textContent).not.toContain("Loading place details");
    expect(harness.leave).toHaveBeenCalledTimes(1);
    const destination = new URL(harness.push.mock.calls[0][0], "https://frederickradius.app");
    expect(destination.pathname).toBe("/places/first-place");
    expect(destination.searchParams.get("returnTo")).toBe(origin);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a closed sheet and ignores a late body without navigating or reopening", async () => {
    let signal: AbortSignal | undefined;
    let finishBody!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return Promise.resolve({ ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) });
    }));
    await click("First");
    await click("Cancel lookup");
    expect(signal?.aborted).toBe(true);
    await act(async () => finishBody({ places: [{ slug: "first-place", name: "Late place" }] }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.recent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the previous lookup when another place is opened", async () => {
    const signals: AbortSignal[] = [];
    const finish: Array<(value: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signals.push(init.signal);
      return new Promise<Response>((resolve) => finish.push(resolve));
    }));
    await click("First");
    await click("Second");
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    await act(async () => finish[0](Response.json({ places: [placeRecord("first-place", "Old place")] })));
    expect(container.textContent).toContain("Loading place details");
    expect(container.textContent).not.toContain("Old place");
    await act(async () => finish[1](Response.json({ places: [placeRecord("second-place", "Second place")] })));
    expect(harness.recent).toHaveBeenCalledExactlyOnceWith("second-place");
    expect(harness.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts when route navigation dismisses the lookup", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    await click("First");
    harness.pathname = "/today";
    await render();
    expect(signal?.aborted).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts on provider unmount without redirecting after cancellation", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    await click("First");
    await act(async () => root.unmount());
    unmounted = true;
    expect(signal?.aborted).toBe(true);
    expect(harness.push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps map identity, return path, opener and one history layer while hydrating", async () => {
    const mapUrl = "/map?q=pizza&c=-77.4,39.4,14&place=first-place";
    harness.pathname = "/map";
    window.history.replaceState({}, "", mapUrl);
    await render();
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    await click("Map first");
    const initial = container.querySelector('[role="dialog"]')!;
    const layer = initial.getAttribute("data-history-layer");
    expect(initial.textContent).toContain("Known first");
    expect(initial.getAttribute("data-metadata-pending")).toBe("true");
    expect(initial.getAttribute("data-opener")).toBe("map-first");
    expect(initial.getAttribute("data-origin")).toBe('{"lng":-77.41,"lat":39.41}');
    expect(initial.getAttribute("data-return-to")).toBe(mapUrl);
    await act(async () => finish(Response.json({ places: [placeRecord("first-place", "Full first")] })));
    const hydrated = container.querySelector('[role="dialog"]')!;
    expect(hydrated.textContent).toContain("Full first");
    expect(hydrated.getAttribute("data-metadata-pending")).toBe("false");
    expect(hydrated.getAttribute("data-history-layer")).toBe(layer);
    expect(hydrated.getAttribute("data-opener")).toBe("map-first");
    expect(hydrated.getAttribute("data-return-to")).toBe(mapUrl);
    expect(window.location.pathname + window.location.search).toBe(mapUrl);
    expect(harness.recent).toHaveBeenCalledExactlyOnceWith("first-place");
    expect(harness.push).not.toHaveBeenCalled();
  });

  it("does not reopen a dismissed seeded map sheet when its transport ignores abort", async () => {
    let signal!: AbortSignal;
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn((_url, init) => { signal = init.signal; return new Promise<Response>(resolve => { finish = resolve; }); }));
    await click("Map first");
    await click("Close details");
    expect(signal.aborted).toBe(true);
    await act(async () => finish(Response.json({ places: [placeRecord("first-place", "Late first")] })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.recent).not.toHaveBeenCalled();
  });

  it("keeps B when A finishes after the newer selected record", async () => {
    const finish: Array<(value: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => finish.push(resolve))));
    await click("Map first");
    await click("Map second");
    await act(async () => finish[1](Response.json({ places: [placeRecord("second-place", "Full second")] })));
    await act(async () => finish[0](Response.json({ places: [placeRecord("first-place", "Late first")] })));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Full second");
    expect(container.textContent).not.toContain("Late first");
    expect(harness.recent).toHaveBeenCalledExactlyOnceWith("second-place");
    expect(harness.push).not.toHaveBeenCalled();
  });

  it("distinguishes a same-slug reopen from its dismissed request", async () => {
    const finish: Array<(value: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => finish.push(resolve))));
    await click("Map first");
    const oldLayer = container.querySelector('[role="dialog"]')?.getAttribute("data-history-layer");
    await click("Close details");
    await click("Map first");
    const newLayer = container.querySelector('[role="dialog"]')?.getAttribute("data-history-layer");
    expect(newLayer).not.toBe(oldLayer);
    await act(async () => finish[1](Response.json({ places: [placeRecord("first-place", "New session")] })));
    await act(async () => finish[0](Response.json({ places: [placeRecord("first-place", "Dismissed session")] })));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("New session");
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-history-layer")).toBe(newLayer);
    expect(harness.recent).toHaveBeenCalledExactlyOnceWith("first-place");
    expect(harness.push).not.toHaveBeenCalled();
  });

  it("ignores seeded hydration after route departure", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    await click("Map first");
    harness.pathname = "/events";
    window.history.replaceState({}, "", "/events");
    await render();
    await act(async () => finish(Response.json({ places: [placeRecord("first-place", "Late first")] })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.recent).not.toHaveBeenCalled();
  });

  it.each([
    { places: [] },
    { places: [{ slug: "different-place", name: "Wrong identity" }] },
    { places: [{ ...placeRecord("first-place", ""), name: null }] },
    { places: [{ ...placeRecord("first-place", "Malformed"), geom: null }] },
    { places: null },
  ])("uses the canonical fallback for a non-seeded missing or malformed record %j", async payload => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    await click("First");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.recent).not.toHaveBeenCalled();
    expect(harness.leave).toHaveBeenCalledTimes(1);
    const destination = new URL(harness.push.mock.calls[0][0], "https://frederickradius.app");
    expect(destination.pathname).toBe("/places/first-place");
    expect(destination.searchParams.get("returnTo")).toBe(origin);
  });

  it.each([
    { places: [] },
    { places: [{ slug: "different-place", name: "Wrong identity" }] },
    { places: [{ ...placeRecord("first-place", ""), name: null }] },
    { places: [{ ...placeRecord("first-place", "Malformed"), geom: null }] },
    { places: null },
  ])("retains a useful seeded sheet when authoritative metadata is malformed %j", async payload => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    await click("Map first");
    const sheet = container.querySelector('[role="dialog"]')!;
    expect(sheet.textContent).toContain("Known first");
    expect(sheet.getAttribute("data-metadata-pending")).toBe("false");
    expect(sheet.getAttribute("data-metadata-unavailable")).toBe("true");
    expect(sheet.getAttribute("data-opener")).toBe("map-first");
    expect(sheet.getAttribute("data-return-to")).toBe(origin);
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.leave).not.toHaveBeenCalled();
    expect(harness.recent).not.toHaveBeenCalled();
  });

  it.each(["rejected", "timed-out"])("retains the same seeded layer and opener after a %s lookup", async outcome => {
    let reject!: (reason: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((_resolve, fail) => { reject = fail; })));
    await click("Map first");
    const layer = container.querySelector('[role="dialog"]')!.getAttribute("data-history-layer");
    if (outcome === "rejected") await act(async () => reject(Error("Offline")));
    else await act(async () => { await vi.advanceTimersByTimeAsync(PLACE_LOOKUP_TIMEOUT_MS); });
    const sheet = container.querySelector('[role="dialog"]')!;
    expect(sheet.textContent).toContain("Known first");
    expect(sheet.getAttribute("data-metadata-pending")).toBe("false");
    expect(sheet.getAttribute("data-metadata-unavailable")).toBe("true");
    expect(sheet.getAttribute("data-history-layer")).toBe(layer);
    expect(sheet.getAttribute("data-opener")).toBe("map-first");
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.leave).not.toHaveBeenCalled();
    expect(harness.recent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reuses a successful recent record but fetches it again after its short cache expires", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ places: [placeRecord("first-place", "Full first")] }));
    vi.stubGlobal("fetch", fetchMock);
    await click("Map first");
    await click("Close details");
    await click("Map first");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-metadata-pending")).toBe("false");
    await click("Close details");
    vi.setSystemTime(Date.now() + 60_001);
    fetchMock.mockResolvedValue(Response.json({ places: [placeRecord("first-place", "Refreshed first")] }));
    await click("Map first");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Refreshed first");
  });
});
