// @vitest-environment jsdom
// Mounted lifecycle-owner proof, not a Mapbox/WebGL appearance test. The child
// records renderer identity; marks become ready only through a separate probe.
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFatalMapboxError, mapboxFailureKind } from "./mapboxFailure";
import { MAP_RENDERER_LOAD_TIMEOUT_MS, useMapRendererLifecycle } from "./useMapRendererLifecycle";
import { shouldApplyInitialMapSelection } from "./mapInitialSelection";

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
