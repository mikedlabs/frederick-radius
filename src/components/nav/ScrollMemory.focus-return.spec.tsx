// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BROWSE_FOCUS_RETURN_KEY, markBrowseFocusDeparture } from "@/lib/browse-focus-return";
import { markBrowseScrollReturn } from "@/lib/browse-scroll-return";
import ScrollMemory from "./ScrollMemory";

const route = vi.hoisted(() => ({ pathname: "/events", search: "in=frederick&lens=week" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.search) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const source = "/events?in=frederick&lens=week";
const destination = "/events/actual-event?returnTo=%2Fevents%3Fin%3Dfrederick%26lens%3Dweek";

function opener() {
  const node = document.createElement("a"); node.href = "/events/actual-event"; node.textContent = "Actual event";
  vi.spyOn(node, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
  document.body.append(node); return node;
}
function prepareIntent() {
  markBrowseFocusDeparture(destination, { tagName: "A", id: "", ariaLabel: null, href: "/events/actual-event" }, sessionStorage, Date.now(), source);
}
function board(complete: boolean) {
  const node = document.createElement("main");
  node.setAttribute("data-events-interaction-ready", "true"); node.setAttribute("data-events-complete", String(complete)); node.setAttribute("aria-busy", String(!complete));
  document.body.append(node); return node;
}

beforeEach(() => {
  vi.useFakeTimers(); route.pathname = "/events"; route.search = "in=frederick&lens=week";
  history.replaceState({}, "", source); sessionStorage.clear();
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "navigate" }] as unknown as PerformanceEntryList);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = ""; vi.clearAllTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); sessionStorage.clear();
});

describe("ScrollMemory's separate native detail focus transaction", () => {
  it("handles fresh back_forward plus Strict Mode replay and waits for the completed replacement Event anchor", async () => {
    vi.mocked(performance.getEntriesByType).mockReturnValue([{ type: "back_forward" }] as unknown as PerformanceEntryList);
    prepareIntent(); const preview = opener(); const previewFocus = vi.spyOn(preview, "focus"); const surface = board(false);
    await act(async () => root.render(<StrictMode><ScrollMemory /></StrictMode>));
    expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(64)); expect(previewFocus).not.toHaveBeenCalled();
    preview.remove(); const actual = opener(); const actualFocus = vi.spyOn(actual, "focus");
    surface.setAttribute("data-events-complete", "true"); surface.setAttribute("aria-busy", "false");
    await act(async () => vi.advanceTimersByTimeAsync(32));
    expect(document.activeElement).toBe(actual); expect(actualFocus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });
  it("reuses the supported explicit Back decision without changing scroll ownership", async () => {
    prepareIntent(); markBrowseScrollReturn(source); const actual = opener(); board(true);
    const focus = vi.spyOn(actual, "focus");
    await act(async () => root.render(<StrictMode><ScrollMemory /></StrictMode>));
    await act(async () => vi.advanceTimersByTimeAsync(32));
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(document.activeElement).toBe(actual); expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  });
  it("leaves the departure intent intact on the actual canonical detail arrival", async () => {
    prepareIntent(); const expected = sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY);
    const path = new URL(destination, location.origin); route.pathname = path.pathname; route.search = path.searchParams.toString(); history.replaceState({}, "", destination);
    await act(async () => root.render(<ScrollMemory />)); await act(async () => vi.advanceTimersByTimeAsync(32));
    expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBe(expected);
  });
  it("does not focus on a fresh listing visit even with matching stored identity", async () => {
    prepareIntent(); const actual = opener(); board(true); const focus = vi.spyOn(actual, "focus");
    await act(async () => root.render(<ScrollMemory />)); await act(async () => vi.advanceTimersByTimeAsync(32));
    expect(focus).not.toHaveBeenCalled(); expect(sessionStorage.getItem(BROWSE_FOCUS_RETURN_KEY)).toBeNull();
  });
});
