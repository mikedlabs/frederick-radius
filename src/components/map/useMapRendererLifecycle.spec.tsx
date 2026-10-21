// @vitest-environment jsdom
// Mounted lifecycle-owner proof, not a Mapbox/WebGL appearance test. The child
// records renderer identity; marks become ready only through a separate probe.
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFatalMapboxError, mapboxFailureKind } from "./mapboxFailure";
import { MAP_RENDERER_LOAD_TIMEOUT_MS, useMapRendererLifecycle } from "./useMapRendererLifecycle";
import { shouldApplyInitialMapSelection } from "./mapInitialSelection";
import { useInitialPlaceCameraFocus } from "./useInitialPlaceCameraFocus";
import { CAM_EASE, FREDERICK_MAX_ZOOM } from "./constants";
import MapResultSurface from "./MapResultSurface";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Lifecycle = ReturnType<typeof useMapRendererLifecycle>;
let lifecycle: Lifecycle;
let markRendered: () => void;
let mounts = 0, unmounts = 0;
const webGL = vi.fn(() => true);

function Renderer() {
  useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
  return <div data-renderer><canvas /><button>Zoom in</button></div>;
}

function Owner({ configured = true, onVisualReady }: { configured?: boolean; onVisualReady?: () => void }) {
  const state = useMapRendererLifecycle({ configured, supportsWebGL: webGL, onVisualReady });
  const [marks, setMarks] = useState("pending");
  useEffect(() => { lifecycle = state; markRendered = () => setMarks("ready"); }, [state]);
  return <section data-error={String(state.mapError)} data-loaded={String(state.mapLoaded)} data-unsupported={String(state.mapUnsupported)} data-failure-kind={state.failureKind ?? undefined} data-marks={marks}>
    {state.mapError && <p role="alert">Available results without the map</p>}
    {state.mountRenderer && <div data-renderer-host inert={state.failureKind === "soft"} aria-hidden={state.failureKind === "soft" || undefined}><Renderer /></div>}
  </section>;
}

describe("map renderer recovery lifecycle", () => {
  let root: Root;
  let container: HTMLDivElement;
  const fetcher = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    webGL.mockReturnValue(true);
    fetcher.mockReset();
    vi.stubGlobal("fetch", fetcher);
    mounts = 0; unmounts = 0;
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
    expect(fetcher).not.toHaveBeenCalled();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  });
  const host = () => container.querySelector("section")!;
  const render = async (props: Parameters<typeof Owner>[0] = {}) => { await act(async () => root.render(<Owner {...props} />)); };

  it("shows the list at 10s, retains one inert renderer, then recovers only on its real load callback", async () => {
    const ready = vi.fn();
    await render({ onVisualReady: ready });
    const renderer = container.querySelector("[data-renderer]");
    await act(async () => vi.advanceTimersByTime(MAP_RENDERER_LOAD_TIMEOUT_MS - 1));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(host().dataset.failureKind).toBe("soft");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Available results");
    expect(container.querySelector("[data-renderer]")).toBe(renderer);
    expect(container.querySelector("[data-renderer-host]")?.hasAttribute("inert")).toBe(true);
    expect(container.querySelector("[data-renderer-host]")?.getAttribute("aria-hidden")).toBe("true");
    expect([mounts, unmounts]).toEqual([1, 0]);
    expect(ready).toHaveBeenCalledTimes(1);
    await act(async () => { expect(lifecycle.markLoaded()).toBe(true); });
    expect(host().dataset.error).toBe("false");
    expect(host().dataset.loaded).toBe("true");
    expect(host().dataset.failureKind).toBeUndefined();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("[data-renderer]")).toBe(renderer);
    expect(container.querySelector("[data-renderer-host]")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector("[data-renderer-host]")?.hasAttribute("aria-hidden")).toBe(false);
    expect(host().dataset.marks).toBe("pending");
    await act(async () => markRendered());
    expect(host().dataset.marks).toBe("ready");
  });

  it("recovers from a cold network error and ignores optional request failures after load", async () => {
    await render();
    const renderer = container.querySelector("[data-renderer]");
    await act(async () => lifecycle.reportError("Failed to fetch"));
    expect(host().dataset.failureKind).toBe("soft");
    expect(container.querySelector("[data-renderer]")).toBe(renderer);
    await act(async () => { lifecycle.markLoaded(); lifecycle.reportError("NetworkError when attempting to fetch resource"); });
    expect(host().dataset.error).toBe("false");
    await act(async () => vi.advanceTimersByTime(MAP_RENDERER_LOAD_TIMEOUT_MS));
    expect(host().dataset.error).toBe("false");
    expect([mounts, unmounts]).toEqual([1, 0]);
  });

  it("does not let a timer already queued before the load overwrite success", async () => {
    const timers = vi.spyOn(window, "setTimeout");
    await render();
    const queued = timers.mock.calls.find(([, delay]) => delay === MAP_RENDERER_LOAD_TIMEOUT_MS)?.[0];
    expect(typeof queued).toBe("function");
    if (typeof queued !== "function") throw new Error("Missing lifecycle load deadline");
    await act(async () => { expect(lifecycle.markLoaded()).toBe(true); queued(); });
    expect(host().dataset.loaded).toBe("true");
    expect(host().dataset.error).toBe("false");
  });

  it.each(["Unauthorized: 401 access token invalid", "WebGL context lost", "Style failed to load"])("keeps a hard failure terminal before a late load: %s", async message => {
    await render();
    const cameraMutation = vi.fn();
    await act(async () => {
      lifecycle.reportError(message);
      if (lifecycle.markLoaded()) cameraMutation();
    });
    expect(host().dataset.failureKind).toBe("hard");
    expect(host().dataset.loaded).toBe("false");
    expect(container.querySelector("[data-renderer]")).toBeNull();
    expect(cameraMutation).not.toHaveBeenCalled();
    expect(unmounts).toBe(1);
    await act(async () => vi.advanceTimersByTime(MAP_RENDERER_LOAD_TIMEOUT_MS));
    expect(host().dataset.failureKind).toBe("hard");
  });

  it("gives a hard failure precedence over an existing soft timeout and any later load", async () => {
    await render();
    await act(async () => vi.advanceTimersByTime(MAP_RENDERER_LOAD_TIMEOUT_MS));
    await act(async () => { lifecycle.reportError("Forbidden 403"); expect(lifecycle.markLoaded()).toBe(false); });
    expect(host().dataset.failureKind).toBe("hard");
    expect(host().dataset.loaded).toBe("false");
    expect(container.querySelector("[data-renderer]")).toBeNull();
  });

  it("does not mount an unconfigured renderer or revive it on a load callback", async () => {
    const ready = vi.fn();
    await render({ configured: false, onVisualReady: ready });
    expect(host().dataset.failureKind).toBe("hard");
    expect(mounts).toBe(0);
    expect(lifecycle.markLoaded()).toBe(false);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves the unsupported-browser distinction without a pending load timer", async () => {
    webGL.mockReturnValue(false);
    await render();
    expect(host().dataset.unsupported).toBe("true");
    expect(host().dataset.failureKind).toBe("hard");
    expect(container.querySelector("[data-renderer]")).toBeNull();
    expect(lifecycle.markLoaded()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not restart its deadline when a parent replaces its readiness callback", async () => {
    const oldReady = vi.fn(), currentReady = vi.fn();
    await render({ onVisualReady: oldReady });
    await act(async () => vi.advanceTimersByTime(9_000));
    await render({ onVisualReady: currentReady });
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(host().dataset.failureKind).toBe("soft");
    expect(oldReady).not.toHaveBeenCalled();
    expect(currentReady).toHaveBeenCalledTimes(1);
  });

  it("cleans up its deadline and refuses callbacks retained after its owner unmounts", async () => {
    const ready = vi.fn();
    await render({ onVisualReady: ready });
    const retired = lifecycle;
    await act(async () => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { retired.reportError("Failed to fetch"); expect(retired.markLoaded()).toBe(false); vi.advanceTimersByTime(MAP_RENDERER_LOAD_TIMEOUT_MS); });
    expect(ready).not.toHaveBeenCalled();
    expect(unmounts).toBe(1);
  });

  it.each([
    ["place", "/map?place=initial-a", null, true, "untouched place"],
    ["place", "/map", null, false, "closed place"],
    ["place", "/map?place=new-b", "new-b", false, "newer place"],
    ["place", "/map?place=initial-a", "initial-a", false, "already-open place"],
    ["event", "/map?event=initial-a", null, true, "untouched event"],
    ["event", "/map", null, false, "closed event"],
    ["event", "/map?place=new-b", null, false, "place replacing event"],
    ["event", "/map?place=new-b&event=initial-a", null, false, "place-first mixed parameters"],
    ["event", "/map?event=initial-a", "initial-a", false, "already-open event"],
  ] as const)("respects current %s intent at late load: %s (%s, %s, %s)", async (kind, liveUrl, alreadyOpen, applies, caseName) => {
    window.history.replaceState(null, "", `/map?${kind}=initial-a`);
    await render();
    await act(async () => vi.advanceTimersByTime(MAP_RENDERER_LOAD_TIMEOUT_MS));
    expect(host().dataset.failureKind).toBe("soft");
    // Use real address-bar changes while the same lifecycle owner is mounted.
    // No invented Mapbox renderer event or application selection is asserted.
    window.history.replaceState(null, "", liveUrl);
    const reopenInitial = vi.fn();
    await act(async () => {
      if (lifecycle.markLoaded() && shouldApplyInitialMapSelection(kind, "initial-a", window.location.search, alreadyOpen)) reopenInitial();
    });
    expect(host().dataset.error).toBe("false");
    expect(reopenInitial, caseName).toHaveBeenCalledTimes(applies ? 1 : 0);
  });
});

describe("compatible Mapbox failure classification", () => {
  it.each([
    ["Failed to fetch", false, "soft", true],
    ["Failed to fetch", true, null, false],
    ["Sprite not found", false, "soft", true],
    ["Sprite not found", true, null, false],
    ["Unauthorized 401", true, "hard", true],
    ["WebGL failed to initialize", false, "hard", true],
    ["Style not found", true, "hard", true],
    ["Unrelated advisory", false, null, false],
  ] as const)("classifies %s after loaded=%s without changing the legacy boolean", (message, loaded, kind, fatal) => {
    expect(mapboxFailureKind(message, loaded)).toBe(kind);
    expect(isFatalMapboxError(message, loaded)).toBe(fatal);
  });
});


// Exercise the production layout effect and actual result-surface markup.
// The renderer's camera API and DOM geometry are bounded unit doubles; this
// proves lifecycle/obstruction handling, not WebGL pin paint or appearance.
describe("cold place focus after the renderer and result card commit", () => {
  const place = { slug: "schifferstadt-architectural-museum-frederick", geom: { lng: -77.4438, lat: 39.4221 } };
  let root: Root;
  let container: HTMLDivElement;
  let pending: { current: string | null };
  let userCameraIntent: boolean;
  const easeTo = vi.fn();
  const markCameraIntent = vi.fn();
  type FocusProps = {
    ready?: boolean;
    card?: boolean;
    visiblePlace?: typeof place | null;
    entryCamera?: boolean;
    otherOwner?: boolean;
    metadata?: string;
    zoom?: number;
  };
  function FocusOwner({ ready = false, card = true, visiblePlace = place, entryCamera = false, otherOwner = false, metadata = "initial", zoom = 9.6 }: FocusProps) {
    useInitialPlaceCameraFocus({
      pending, ready, selectedPlace: visiblePlace,
      getMap: () => ({
        getContainer: () => container.querySelector<HTMLElement>(".mapboxgl-map")!,
        getZoom: () => zoom,
        easeTo,
      }),
      hasEntryCamera: entryCamera,
      hasUserCameraIntent: () => userCameraIntent,
      hasOtherCameraOwner: () => otherOwner,
      markCameraIntent,
    });
    return <div className="dock-host">
      <div className="mapboxgl-map"><canvas /></div>
      {card && <MapResultSurface className="map-peek" ariaLabel="Selected place" onClose={() => { pending.current = null; }}>
        <div data-map-place-slug={place.slug}>{metadata}</div>
      </MapResultSurface>}
    </div>;
  }
  beforeEach(() => {
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
    pending = { current: place.slug };
    userCameraIntent = false;
    easeTo.mockReset(); markCameraIntent.mockReset();
    vi.stubGlobal("innerWidth", 390); vi.stubGlobal("innerHeight", 844);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".mapboxgl-map")) return new DOMRect(0, 57, 390, 720);
      if (this.matches(".map-peek")) return new DOMRect(8, 324, 374, 445);
      return new DOMRect();
    });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed in camera lifecycle proof"); }));
    window.history.replaceState(null, "", `/map?place=${place.slug}`);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
    expect(fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  const render = async (props: FocusProps = {}) => { await act(async () => root.render(<FocusOwner {...props} />)); };

  it("waits for a real load, then focuses above the mounted card despite generated county c", async () => {
    await render();
    expect(easeTo).not.toHaveBeenCalled();
    window.history.replaceState(null, "", `/map?place=${place.slug}&c=-77.4100,39.4600,9.60`);
    await render({ ready: true });
    expect(container.querySelector(".map-peek[data-map-result-surface]")).not.toBeNull();
    expect(easeTo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      center: [place.geom.lng, place.geom.lat], zoom: 15,
      padding: { top: 20, right: 20, bottom: 469, left: 20 }, retainPadding: false,
    }));
    expect(markCameraIntent).toHaveBeenCalledTimes(1);
    await render({ ready: true, metadata: "hours and photo metadata arrived" });
    expect(easeTo).toHaveBeenCalledTimes(1);
  });

  it.each([
    [8.63, 15],
    [9.6, 15],
    [16.5, 16.5],
    [FREDERICK_MAX_ZOOM, FREDERICK_MAX_ZOOM],
  ])("reaches the cold-place intent from actual map zoom %s without reducing a closer view", async (zoom, expectedZoom) => {
    // The production hook calls the actual smoothFocus helper; only the map
    // camera API and measured DOM rectangles are doubles. At8.63 the old
    // fixed six-level step incorrectly requested14.63 instead of15.
    await render({ ready: true, zoom });
    expect(easeTo).toHaveBeenCalledExactlyOnceWith({
      center: [place.geom.lng, place.geom.lat],
      zoom: expectedZoom,
      padding: { top: 20, right: 20, bottom: 469, left: 20 },
      retainPadding: false,
      duration: 520,
      easing: CAM_EASE,
      essential: true,
    });
    expect(easeTo.mock.calls[0][0].zoom).toBeLessThanOrEqual(FREDERICK_MAX_ZOOM);
    expect(markCameraIntent).toHaveBeenCalledTimes(1);
    await render({ ready: true, zoom, metadata: "later metadata" });
    expect(easeTo).toHaveBeenCalledTimes(1);
  });

  it("reaches15 from the low county zoom without motion when reduced motion is requested", async () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" })));
    await render({ ready: true, zoom: 8.63 });
    expect(easeTo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      zoom: 15, duration: 0,
      center: [place.geom.lng, place.geom.lat],
      padding: { top: 20, right: 20, bottom: 469, left: 20 },
      retainPadding: false,
    }));
  });

  it("waits for the actual card and matching visible canonical pin", async () => {
    await render({ ready: true, card: false });
    expect(easeTo).not.toHaveBeenCalled();
    await render({ ready: true, visiblePlace: null });
    expect(easeTo).not.toHaveBeenCalled();
    await render({ ready: true });
    expect(easeTo).toHaveBeenCalledTimes(1);
  });

  it("uses the same actual result markup for the desktop card obstruction", async () => {
    vi.stubGlobal("innerWidth", 1440); vi.stubGlobal("innerHeight", 900);
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      if (this.matches(".mapboxgl-map")) return new DOMRect(0, 88, 1440, 772);
      if (this.matches(".map-peek")) return new DOMRect(10, 430, 460, 418);
      return new DOMRect();
    });
    await render({ ready: true });
    expect(easeTo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      padding: { top: 96, right: 40, bottom: 446, left: 40 }, retainPadding: false,
    }));
  });

  it.each(["saved entry camera", "user gesture", "Nearby or scene"])("consumes once without moving for %s", async (owner) => {
    await render();
    userCameraIntent = owner === "user gesture";
    await render({ ready: true, entryCamera: owner === "saved entry camera", otherOwner: owner === "Nearby or scene" });
    expect(easeTo).not.toHaveBeenCalled();
    userCameraIntent = false;
    await render({ ready: true, metadata: "later metadata" });
    expect(easeTo).not.toHaveBeenCalled();
  });

  it("does not revive a cold request after a newer URL, Close, or return to the same place", async () => {
    await render();
    window.history.replaceState(null, "", "/map?place=baker-park-frederick");
    await render({ ready: true });
    expect(easeTo).not.toHaveBeenCalled();
    window.history.replaceState(null, "", `/map?place=${place.slug}`);
    await render({ ready: true });
    expect(easeTo).not.toHaveBeenCalled();
    // A fresh still-pending load can also be cancelled through the real card.
    pending.current = place.slug;
    await render({ ready: false });
    await act(async () => { container.querySelector<HTMLButtonElement>(".map-peek-close")!.click(); });
    await render({ ready: true });
    expect(easeTo).not.toHaveBeenCalled();
  });
});
