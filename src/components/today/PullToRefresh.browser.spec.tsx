// @vitest-environment jsdom
import { act, createElement, Fragment, Suspense, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({ pathname: "/today", refresh: vi.fn(), router: { refresh: () => undefined } }));
vi.mock("next/navigation", () => ({ usePathname: () => harness.pathname, useRouter: () => harness.router }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
import PullToRefresh from "./PullToRefresh";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
describe("Today pull refresh feedback", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers(); harness.pathname = "/today"; harness.refresh.mockReset(); harness.router.refresh = harness.refresh;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
  });
  function touch(type: string, y: number) {
    const event = new Event(type, { bubbles: true }); Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientY: y }] }); container.dispatchEvent(event);
  }
  function gesture() { touch("touchstart", 0); touch("touchmove", 150); touch("touchend", 150); }
  it("acknowledges a refresh request without claiming that sources are up to date", async () => {
    await act(async () => root.render(createElement(PullToRefresh)));
    await act(async () => gesture()); expect(harness.refresh).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(650));
    expect(container.querySelector('[role="status"]')?.textContent).not.toMatch(/up to date/i);
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/request/i);
  });
  it("refuses a repeated gesture while the refresh request is outstanding", async () => {
    await act(async () => root.render(createElement(PullToRefresh)));
    await act(async () => { gesture(); gesture(); });
    expect(harness.refresh).toHaveBeenCalledTimes(1);
  });
  it("does not carry an old completion announcement across a route exit", async () => {
    await act(async () => root.render(createElement(PullToRefresh)));
    await act(async () => gesture());
    harness.pathname = "/map"; await act(async () => root.render(createElement(PullToRefresh)));
    await act(async () => vi.advanceTimersByTimeAsync(650));
    harness.pathname = "/today"; await act(async () => root.render(createElement(PullToRefresh)));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
  });
  it("holds one request through the actual React transition and allows a fresh request after it settles", async () => {
    let finish!: () => void; let ready = false; const gate = new Promise<void>((resolve) => { finish = resolve; });
    function Content({ version }: { version: number }) { if (version && !ready) throw gate; return createElement("p", null, `Version ${version}`); }
    function Host() {
      const [version, setVersion] = useState(0); harness.refresh.mockImplementation(() => setVersion((value) => value + 1));
      return createElement(Fragment, null, createElement(PullToRefresh), createElement(Suspense, { fallback: "Loading" }, createElement(Content, { version })));
    }
    await act(async () => root.render(createElement(Host)));
    await act(async () => gesture());
    expect(container.querySelector("[data-pull-refresh-indicator]")?.getAttribute("data-refresh-pending")).toBe("true");
    await act(async () => gesture()); expect(harness.refresh).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(650));
    expect(container.querySelector("[data-pull-refresh-indicator]")?.getAttribute("data-refresh-pending")).toBe("true");
    expect(container.querySelector('[role="status"]')?.textContent).not.toMatch(/up to date/i);
    ready = true; await act(async () => finish());
    expect(container.querySelector("[data-pull-refresh-indicator]")?.getAttribute("data-refresh-pending")).toBe("false");
    await act(async () => gesture()); expect(harness.refresh).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])("keeps pending feedback while the motion preference changes from %s", async (initialReduced) => {
    let matches = initialReduced;
    const listeners = new Set<() => void>();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({
      get matches() { return matches; },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    })) });
    let finish!: () => void; let ready = false; const gate = new Promise<void>((resolve) => { finish = resolve; });
    function Content({ version }: { version: number }) { if (version && !ready) throw gate; return createElement("p", null, `Version ${version}`); }
    function Host() {
      const [version, setVersion] = useState(0); harness.refresh.mockImplementation(() => setVersion((value) => value + 1));
      return createElement(Fragment, null, createElement(PullToRefresh), createElement(Suspense, { fallback: "Loading" }, createElement(Content, { version })));
    }
    await act(async () => root.render(createElement(Host)));
    await act(async () => gesture());
    expect(container.querySelector("[data-pull-refresh-indicator]")?.getAttribute("data-refresh-pending")).toBe("true");
    await act(async () => { matches = !initialReduced; for (const listener of listeners) listener(); });
    expect(container.querySelector("[data-pull-refresh-indicator]")?.getAttribute("data-refresh-pending")).toBe("true");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Refresh requested. Source checks may still be pending.");
    expect(container.querySelector("svg")?.classList.contains("animate-spin")).toBe(!matches);
    await act(async () => gesture()); expect(harness.refresh).toHaveBeenCalledTimes(1);
    ready = true; await act(async () => finish());
    expect(container.querySelector("[data-pull-refresh-indicator]")?.getAttribute("data-refresh-pending")).toBe("false");
    await act(async () => gesture()); expect(harness.refresh).toHaveBeenCalledTimes(2);
  });

  it("clears hidden gesture feedback and does not dispatch a hidden or resumed stale gesture", async () => {
    await act(async () => root.render(createElement(PullToRefresh)));
    await act(async () => { touch("touchstart", 0); touch("touchmove", 150); });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => gesture()); expect(harness.refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); touch("touchend", 150); });
    expect(harness.refresh).not.toHaveBeenCalled(); expect(container.querySelector('[role="status"]')?.textContent).toBe("");
    await act(async () => gesture()); expect(harness.refresh).toHaveBeenCalledTimes(1);
  });
  it("does not restore a pending request announcement after hiding during its transition", async () => {
    let finish!: () => void; let ready = false; const gate = new Promise<void>((resolve) => { finish = resolve; });
    function Content({ pending }: { pending: boolean }) { if (pending && !ready) throw gate; return createElement("p", null, "Today"); }
    function Host() {
      const [pending, setPending] = useState(false); harness.refresh.mockImplementation(() => setPending(true));
      return createElement(Fragment, null, createElement(PullToRefresh), createElement(Suspense, { fallback: "Loading" }, createElement(Content, { pending })));
    }
    await act(async () => root.render(createElement(Host))); await act(async () => gesture());
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
    ready = true; await act(async () => finish());
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
    await act(async () => gesture()); expect(harness.refresh).toHaveBeenCalledTimes(2);
  });
  it("does not complete a cancelled gesture or react to an empty or multi-touch start", async () => {
    await act(async () => root.render(createElement(PullToRefresh)));
    await act(async () => { touch("touchstart", 0); touch("touchmove", 150); touch("touchcancel", 150); touch("touchend", 150); });
    await act(async () => {
      for (const touches of [[], [{ clientY: 0 }, { clientY: 1 }]]) {
        const event = new Event("touchstart", { bubbles: true }); Object.defineProperty(event, "touches", { value: touches }); container.dispatchEvent(event); touch("touchend", 150);
      }
    });
    expect(harness.refresh).not.toHaveBeenCalled();
  });
  it("leaves controls and non-Today routes alone", async () => {
    await act(async () => root.render(createElement(Fragment, null, createElement(PullToRefresh), createElement("button", null, "Control"))));
    await act(async () => {
      const event = new Event("touchstart", { bubbles: true }); Object.defineProperty(event, "touches", { value: [{ clientY: 0 }] }); container.querySelector("button")!.dispatchEvent(event); touch("touchmove", 150); touch("touchend", 150);
    });
    expect(harness.refresh).not.toHaveBeenCalled();
    harness.pathname = "/map"; await act(async () => root.render(createElement(PullToRefresh)));
    await act(async () => gesture()); expect(harness.refresh).not.toHaveBeenCalled();
  });
  it("keeps the gesture functional with reduced motion without a fake completion timer", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    await act(async () => root.render(createElement(PullToRefresh))); await act(async () => gesture());
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Refresh requested. Source checks may still be pending.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a rejected refresh dispatch instead of acknowledging a request", async () => {
    harness.refresh.mockImplementation(() => { throw new Error("Router unavailable"); });
    await act(async () => root.render(createElement(PullToRefresh))); await act(async () => gesture());
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Refresh could not be requested. Please try again.");
    expect(container.querySelector("[data-pull-refresh-indicator]")?.getAttribute("data-refresh-pending")).toBe("false");
  });

});
