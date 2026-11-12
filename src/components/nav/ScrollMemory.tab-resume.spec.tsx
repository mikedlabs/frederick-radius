// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelPrimaryTabResume, preparePrimaryTabResume, rememberPrimaryTab } from "@/lib/primary-tab-session";
import ScrollMemory from "./ScrollMemory";

const route = vi.hoisted(() => ({ pathname: "/events", search: "in=frederick&lens=weekend" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.search) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const path = "/events?in=frederick&lens=weekend";
let root: Root, host: HTMLDivElement, position: number, surface: HTMLElement;
let scroll: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.dispatchEvent(new Event("pagehide")); window.dispatchEvent(new Event("pageshow"));
  vi.useFakeTimers(); sessionStorage.clear(); cancelPrimaryTabResume();
  route.pathname = "/events"; route.search = "in=frederick&lens=weekend"; history.replaceState({}, "", path);
  position = 0;
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(400);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(1_800);
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => position);
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "navigate" }] as unknown as PerformanceEntryList);
  scroll = vi.fn((options: ScrollToOptions) => { position = options.top ?? 0; window.dispatchEvent(new Event("scroll")); });
  vi.stubGlobal("scrollTo", scroll);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  host = document.createElement("div"); surface = document.createElement("main");
  surface.dataset.eventsInteractionReady = "true"; surface.dataset.eventsComplete = "true"; surface.setAttribute("aria-busy", "false");
  document.body.append(host, surface); root = createRoot(host);
});
afterEach(async () => {
  window.dispatchEvent(new Event("pagehide")); await act(async () => root.unmount()); host.remove(); surface.remove();
  vi.clearAllTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); sessionStorage.clear(); cancelPrimaryTabResume();
});
const mount = () => act(async () => root.render(<StrictMode><ScrollMemory /></StrictMode>));
const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

describe("primary-tab scroll resume", () => {
  it("restores an explicitly resumed list through effect replay and waits for actual Events readiness", async () => {
    rememberPrimaryTab(path, 612); preparePrimaryTabResume("/events");
    surface.dataset.eventsInteractionReady = "false";
    await mount(); await advance(3_200); expect(scroll).not.toHaveBeenCalled();
    surface.dataset.eventsInteractionReady = "true"; await advance(16);
    expect(position).toBe(612); await advance(3_032);
    expect(sessionStorage.getItem(`fr:scroll:${path}`)).toBe("612");
  });
  it("restores a remembered top position instead of retaining the outgoing tab's deep scroll", async () => {
    rememberPrimaryTab(path, 0); preparePrimaryTabResume("/events"); position = 700;
    await mount(); await advance(16); expect(position).toBe(0);
  });
  it("never overrides a direct/shared URL just because the tab has an older position", async () => {
    rememberPrimaryTab(path, 612); sessionStorage.setItem(`fr:scroll:${path}`, "612");
    await mount(); await advance(500); expect(scroll).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(`fr:scroll:${path}`)).toBeNull();
  });
  it("cancels an uncommitted tab intent for an explicit link or native Back", async () => {
    rememberPrimaryTab(path, 612); preparePrimaryTabResume("/events");
    const explicit = document.createElement("a"); explicit.href = path; document.body.append(explicit);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    explicit.addEventListener("click", event => event.preventDefault()); explicit.dispatchEvent(click); explicit.remove();
    await mount(); await advance(500); expect(scroll).not.toHaveBeenCalled();
  });
  it("lets the first new touch stop the tab correction", async () => {
    rememberPrimaryTab(path, 612); preparePrimaryTabResume("/events"); await mount();
    window.dispatchEvent(new Event("touchmove")); await advance(1_000); expect(scroll).not.toHaveBeenCalled();
  });
  it("retains a bounded in-document resume when sessionStorage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw Error("blocked"); });
    rememberPrimaryTab(path, 412); preparePrimaryTabResume("/events");
    await mount(); await advance(16); expect(position).toBe(412);
  });
  it("waits for Next's exact query key after the Map layout handoff reinstates a private query", async () => {
    route.pathname = "/map"; route.search = "in=frederick";
    history.replaceState({}, "", "/map?in=frederick&q=coffee");
    rememberPrimaryTab("/map?in=frederick&q=coffee", 412); preparePrimaryTabResume("/map");
    await mount(); await advance(16); expect(scroll).not.toHaveBeenCalled();
    route.search = "in=frederick&q=coffee";
    await mount(); await advance(16); expect(position).toBe(412);
  });
});
