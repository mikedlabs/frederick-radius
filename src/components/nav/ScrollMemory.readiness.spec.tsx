// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markBrowseScrollReturn } from "@/lib/browse-scroll-return";
import ScrollMemory from "./ScrollMemory";

const route = vi.hoisted(() => ({ pathname: "/events", search: "in=frederick&lens=today&sort=az" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.search) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const path = "/events?in=frederick&lens=today&sort=az";
const key = `fr:scroll:${path}`;
let root: Root;
let host: HTMLDivElement;
let position: number;
let height: number;
let scroll: ReturnType<typeof vi.fn>;

function board(ready = false, complete = false, busy = true) {
  const node = document.createElement("main");
  node.setAttribute("data-events-interaction-ready", String(ready));
  node.setAttribute("data-events-complete", String(complete));
  node.setAttribute("aria-busy", String(busy));
  document.body.append(node);
  return node;
}
function ready(node: HTMLElement) {
  node.setAttribute("data-events-interaction-ready", "true");
  node.setAttribute("data-events-complete", "true");
  node.setAttribute("aria-busy", "false");
  height = 1_800;
}
async function advance(ms: number) { await act(async () => vi.advanceTimersByTimeAsync(ms)); }
async function mount() {
  markBrowseScrollReturn(path);
  await act(async () => root.render(<StrictMode><ScrollMemory /></StrictMode>));
}

beforeEach(() => {
  // Cancel any module-owned correction from the preceding test before its
  // timer globals are replaced; route-effect cleanup intentionally cannot own it.
  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("pageshow"));
  vi.useFakeTimers();
  route.pathname = "/events"; route.search = "in=frederick&lens=today&sort=az";
  history.replaceState({}, "", path); sessionStorage.clear(); sessionStorage.setItem(key, "967");
  position = 646; height = 1_046;
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(400);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockImplementation(() => height);
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => position);
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "navigate" }] as unknown as PerformanceEntryList);
  scroll = vi.fn((options: ScrollToOptions) => { position = options.top ?? 0; window.dispatchEvent(new Event("scroll")); });
  vi.stubGlobal("scrollTo", scroll);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  window.dispatchEvent(new Event("pagehide"));
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.clearAllTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); sessionStorage.clear();
});

describe("Events scroll memory waits for the actual ready calendar", () => {
  it("preserves the original target through a six-second short preview and a late native clamp", async () => {
    const surface = board();
    await mount();
    window.dispatchEvent(new Event("scroll")); // Native clamp is not a new reader position.
    await advance(6_000);
    expect(scroll).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBe("967");
    window.dispatchEvent(new PopStateEvent("popstate")); // Same transaction must retain its target.
    ready(surface); await advance(16);
    expect(position).toBe(967);
    position = 500; window.dispatchEvent(new Event("scroll"));
    await advance(16);
    expect(position).toBe(967);
    expect(sessionStorage.getItem(key)).toBe("967");
    await advance(3_000);
    expect(sessionStorage.getItem(key)).toBe("967");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("requires restored URL state, complete data and a non-busy board before admission", async () => {
    const surface = board(false, true, false); height = 1_800;
    await mount(); await advance(3_200); expect(scroll).not.toHaveBeenCalled();
    surface.setAttribute("data-events-interaction-ready", "true");
    surface.setAttribute("data-events-complete", "false");
    await advance(16); expect(scroll).not.toHaveBeenCalled();
    surface.setAttribute("data-events-complete", "true"); surface.setAttribute("aria-busy", "true");
    await advance(16); expect(scroll).not.toHaveBeenCalled();
    surface.setAttribute("aria-busy", "false"); await advance(16);
    expect(position).toBe(967);
  });

  it("recognizes a pending module traversal when the SPA route effect arrives after three seconds", async () => {
    const surface = board();
    window.dispatchEvent(new PopStateEvent("popstate"));
    await advance(4_000);
    await act(async () => root.render(<ScrollMemory />));
    window.dispatchEvent(new Event("scroll"));
    await advance(500); // Beyond both POP_FRESH_MS and the fresh-navigation clear.
    expect(sessionStorage.getItem(key)).toBe("967");
    expect(scroll).not.toHaveBeenCalled();
    ready(surface); await advance(16);
    expect(position).toBe(967);
  });

  it.each(["wheel", "touchmove", "pointerdown", "keydown"])("yields to %s during the readiness wait and records the reader's new position", async (event) => {
    const surface = board(); await mount(); await advance(4_000);
    window.dispatchEvent(new Event(event));
    position = 111; window.dispatchEvent(new Event("scroll")); await advance(16);
    expect(sessionStorage.getItem(key)).toBe("111");
    ready(surface); await advance(4_000);
    expect(scroll).not.toHaveBeenCalled(); expect(position).toBe(111);
  });

  it("yields to input during the normal settle window without a later jump", async () => {
    const surface = board(); ready(surface); await mount(); await advance(16);
    expect(position).toBe(967);
    window.dispatchEvent(new Event("wheel")); position = 222;
    window.dispatchEvent(new Event("scroll")); await advance(4_000);
    expect(position).toBe(222); expect(scroll).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(key)).toBe("222");
  });

  it("cleans up a pending correction when the route changes without writing a clamp to the departed key", async () => {
    const surface = board(); await mount(); await advance(4_000);
    route.pathname = "/today"; route.search = ""; history.replaceState({}, "", "/today");
    await act(async () => root.render(<ScrollMemory />));
    position = 0; window.dispatchEvent(new Event("scroll")); ready(surface); await advance(12_000);
    expect(scroll).not.toHaveBeenCalled(); expect(sessionStorage.getItem(key)).toBe("967");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels on pagehide, then admits one native BFCache traversal after pageshow", async () => {
    const surface = board(); await mount(); await advance(4_000);
    window.dispatchEvent(new Event("pagehide")); ready(surface); await advance(16);
    expect(scroll).not.toHaveBeenCalled(); expect(sessionStorage.getItem(key)).toBe("967");
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    window.dispatchEvent(new PopStateEvent("popstate")); await advance(16);
    expect(scroll).toHaveBeenCalledTimes(1); expect(position).toBe(967);
  });

  it("cancels an already queued recorder frame at pagehide and resumes recording only after pageshow", async () => {
    board(); await mount();
    window.dispatchEvent(new Event("wheel")); // End correction; the recorder now owns actual input.
    position = 111; window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("pagehide"));
    position = 0; window.dispatchEvent(new Event("scroll"));
    await advance(32);
    expect(sessionStorage.getItem(key)).toBe("967");
    expect(scroll).not.toHaveBeenCalled();
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    position = 222; window.dispatchEvent(new Event("scroll")); await advance(16);
    expect(sessionStorage.getItem(key)).toBe("222");
  });

  it.each([[1_046, 646], [2_000, 967]])("bounds unready timeout at the original target or current bottom (height %i)", async (pendingHeight, expected) => {
    board(); height = pendingHeight; position = 0;
    await mount(); await advance(9_984);
    expect(scroll).not.toHaveBeenCalled(); expect(sessionStorage.getItem(key)).toBe("967");
    // Repeated popstate must not restart the bounded readiness deadline.
    window.dispatchEvent(new PopStateEvent("popstate")); await advance(32);
    expect(position).toBe(expected); expect(scroll).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(key)).toBe(String(expected)); expect(vi.getTimerCount()).toBe(0);
    const surface = document.querySelector<HTMLElement>("[data-events-interaction-ready]")!;
    ready(surface); await advance(4_000);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("uses the unchanged three-second settle boundary for a ready calendar that remains shorter", async () => {
    board(true, true, false); position = 0;
    await mount(); await advance(2_992);
    expect(scroll).not.toHaveBeenCalled(); expect(sessionStorage.getItem(key)).toBe("967");
    await advance(16);
    expect(position).toBe(646); expect(sessionStorage.getItem(key)).toBe("646");
    // The changed sessionStorage value queues jsdom's storage event after the
    // terminal frame. Drain it and verify no correction loop remains.
    await advance(32);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
