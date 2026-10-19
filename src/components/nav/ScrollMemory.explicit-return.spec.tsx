// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markBrowseScrollReturn } from "@/lib/browse-scroll-return";
import ScrollMemory from "./ScrollMemory";

const route = vi.hoisted(() => ({ pathname: "/today", search: "in=frederick" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.search) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let position: number;
let scroll: ReturnType<typeof vi.fn>;
const path = "/today?in=frederick";

beforeEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("pageshow"));
  vi.useFakeTimers();
  route.pathname = "/today";
  route.search = "in=frederick";
  window.history.replaceState({}, "", path);
  window.sessionStorage.clear();
  position = 0;
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(400);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(1_200);
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => position);
  scroll = vi.fn((options: ScrollToOptions) => { position = options.top ?? 0; });
  vi.stubGlobal("scrollTo", scroll);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("full-document explicit listing return", () => {
  it("restores existing exact-URL memory under effect replay instead of clearing it as a fresh visit", async () => {
    window.sessionStorage.setItem(`fr:scroll:${path}`, "412");
    markBrowseScrollReturn(path);
    await act(async () => root.render(<StrictMode><ScrollMemory /></StrictMode>));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(scroll).toHaveBeenCalledWith({ top: 412, behavior: "instant" });
    expect(position).toBe(412);
    expect(window.sessionStorage.getItem(`fr:scroll:${path}`)).toBe("412");
  });

  it("does not restore an unrelated route and removes its own stale fresh-navigation memory", async () => {
    window.sessionStorage.setItem(`fr:scroll:${path}`, "412");
    markBrowseScrollReturn("/events?in=frederick&lens=today");
    await act(async () => root.render(<ScrollMemory />));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(scroll).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(`fr:scroll:${path}`)).toBeNull();
  });

  it("gives a new touch gesture priority over an explicit position correction", async () => {
    window.sessionStorage.setItem(`fr:scroll:${path}`, "412");
    markBrowseScrollReturn(path);
    await act(async () => root.render(<ScrollMemory />));
    window.dispatchEvent(new Event("touchmove"));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(scroll).not.toHaveBeenCalled();
  });
});
