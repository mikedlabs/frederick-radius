// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompassHub from "./CompassHub";
import { installNativeReturnOwner, NATIVE_REQUEST_ENTRY_KEY } from "@/components/search/native-request-return";
import { consumeFindRequest } from "@/lib/findBridge";

vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ prefetch: _prefetch, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) =>
  { void _prefetch; return <a {...props} onClick={(event) => { onClick?.(event); event.preventDefault(); }} />; } }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

let root: Root;
let releaseOwner: () => void;
let nativeReplace: History["replaceState"];
let host: HTMLDivElement;
const now = "2026-10-12T16:00:00.000Z";
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  nativeReplace = window.history.replaceState;
  releaseOwner = installNativeReturnOwner();
  window.localStorage.clear(); window.history.replaceState({}, "", "/compass");
  consumeFindRequest("global"); consumeFindRequest("map");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ readAt: now, keys: [] }) }));
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  window.localStorage.clear(); consumeFindRequest("global");
  releaseOwner(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function render(embeddedInToolsDrawer = false) {
  await act(async () => root.render(<CompassHub embeddedInToolsDrawer={embeddedInToolsDrawer} />));
  await act(async () => vi.advanceTimersByTimeAsync(0));
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
function intent(id: string) { return host.querySelector<HTMLElement>(`[data-compass-intent="${id}"]`)!; }
function toggle(id: string) { return intent(id).querySelector<HTMLButtonElement>("button[aria-controls]")!; }
function button(text: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === text)!; }
function dialog() { return document.querySelector<HTMLElement>('[role="dialog"]'); }
async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setValue.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("Tools request-to-action flow", () => {
  it("restores exact native index editing words and input focus after a popped entry remount", async () => {
    await render(true); await click(button("Browse the full tool index"));
    let field = host.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    await type(field, "coffee & tea");
    await click(host.querySelector<HTMLAnchorElement>('a[href="/search?q=coffee%20%26%20tea"]')!);
    const state = window.history.state; const href = window.location.pathname + window.location.search;
    expect(state[NATIVE_REQUEST_ENTRY_KEY]).toMatchObject({ draft: { kind: "tools", query: "coffee & tea" }, target: "tool-filter" });
    await act(async () => root.unmount()); root = createRoot(host);
    window.history.pushState({ ...state }, "", "/search?q=coffee%20%26%20tea");
    await act(async () => {
      nativeReplace.call(window.history, state, "", href);
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });
    await render(true); await act(async () => vi.advanceTimersByTimeAsync(80));
    field = host.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    expect(field.value).toBe("coffee & tea"); expect(document.activeElement).toBe(field);
    expect(window.location.pathname + window.location.search).toBe(href);
    expect(host.querySelector('a[href="/search?q=coffee%20%26%20tea"]')).not.toBeNull();
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY].target).toBeUndefined();
  });
  it("captures only unmodified embedded Find activation and restores the actual launcher", async () => {
    await render(true); const find = host.querySelector<HTMLAnchorElement>("[data-compass-find]")!;
    await act(async () => find.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY]).toBeUndefined();
    await click(find); const state = window.history.state;
    expect(state[NATIVE_REQUEST_ENTRY_KEY].target).toBe("compass-find");
    window.history.pushState(state, "", "/search");
    await act(async () => {
      nativeReplace.call(window.history, state, "", "/compass");
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
      await vi.advanceTimersByTimeAsync(80);
    });
    expect(document.activeElement).toBe(find);
  });
  it("leaves a native Find destination usable while client-only controls await hydration", () => {
    const initial = document.createElement("div"); initial.innerHTML = renderToString(<CompassHub />);
    expect(initial.querySelector<HTMLAnchorElement>("[data-compass-find]")?.getAttribute("href")).toBe("/search");
    for (const control of initial.querySelectorAll<HTMLButtonElement>("button")) expect(control.disabled).toBe(true);
    expect(initial.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
  });
  it("restores only a valid chapter while retaining scope, query and history state", async () => {
    window.history.replaceState({ marker: "keep" }, "", "/compass?in=thurmont&q=coffee&chapter=get-around");
    const replace = vi.spyOn(window.history, "replaceState"); const push = vi.spyOn(window.history, "pushState");
    await render(); expect(toggle("get-around").getAttribute("aria-expanded")).toBe("true");
    await click(toggle("go-out"));
    expect(window.location.search).toBe("?in=thurmont&q=coffee&chapter=go-out");
    expect(window.history.state).toEqual({ marker: "keep" }); expect(replace).toHaveBeenCalledTimes(1); expect(push).not.toHaveBeenCalled();
    await act(async () => root.unmount()); root = createRoot(host); await render();
    expect(toggle("go-out").getAttribute("aria-expanded")).toBe("true");
    window.history.replaceState({ marker: "keep" }, "", "/compass?in=thurmont&q=coffee&chapter=unknown");
    await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
    for (const id of ["go-out", "get-around", "local-help", "explore-yours"]) expect(toggle(id).getAttribute("aria-expanded")).toBe("false");
    expect(window.location.search).toBe("?in=thurmont&q=coffee&chapter=unknown");
  });
  it("keeps an encoded request in the index link and existing recents", async () => {
    await render(); await click(button("Browse the full tool index"));
    const input = dialog()!.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    await type(input, "coffee");
    const search = dialog()!.querySelector<HTMLAnchorElement>('a[href="/search?q=coffee"]')!;
    expect(search).not.toBeNull(); await click(search);
    expect(JSON.parse(window.localStorage.getItem("fr.compass.recent.v1")!)).toEqual(["/search?q=coffee"]);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    const recent = host.querySelector<HTMLAnchorElement>('a[href="/search?q=coffee"]');
    expect(recent).not.toBeNull();
    window.localStorage.setItem("fr.compass.recent.v1", JSON.stringify(["/search?q=coffee&redirect=https://example.com", "//example.com/search?q=coffee", "/ask?q=help#external"]));
    await act(async () => root.unmount()); root = createRoot(host); await render();
    expect(host.querySelector('a[href*="example.com"]')).toBeNull();
    expect(host.querySelector('a[href="/ask?q=help#external"]')).toBeNull();
  });
  it("keeps distinct recent requests stable through reorder and removal", async () => {
    const coffee = "/search?q=coffee";
    const brunch = "/search?q=brunch";
    const parks = "/ask?q=parks";
    window.localStorage.setItem("fr.compass.recent.v1", JSON.stringify([coffee, brunch, parks]));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await render();
    const recent = () => host.querySelector<HTMLElement>('section[aria-labelledby="compass-recent-heading"]')!;
    const links = () => [...recent().querySelectorAll<HTMLAnchorElement>("a")];
    const initial = new Map(links().map((link) => [link.getAttribute("href"), link]));
    expect([...initial.keys()]).toEqual([coffee, brunch, parks]);
    await click(initial.get(brunch)!);
    expect(links().map((link) => link.getAttribute("href"))).toEqual([brunch, coffee, parks]);
    for (const href of [coffee, brunch, parks]) expect(links().find((link) => link.getAttribute("href") === href)).toBe(initial.get(href));
    await click(button("Browse the full tool index"));
    const input = dialog()!.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    await type(input, "lunch");
    await click(dialog()!.querySelector<HTMLAnchorElement>('a[href="/search?q=lunch"]')!);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(links().map((link) => link.getAttribute("href"))).toEqual(["/search?q=lunch", brunch, coffee]);
    for (const href of [brunch, coffee]) expect(links().find((link) => link.getAttribute("href") === href)).toBe(initial.get(href));
    expect(recent().querySelector('a[href="/ask?q=parks"]')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("fr.compass.recent.v1")!)).toEqual(["/search?q=lunch", brunch, coffee, parks]);
    expect(errors.mock.calls.filter((args) => /same key|Encountered two children/.test(String(args[0])))).toHaveLength(0);
  });
  it("returns a cold legacy index to the selected inline chapter without changing scope", async () => {
    window.history.replaceState({}, "", "/compass?in=thurmont&chapter=go-out&deck=all");
    await render(); expect(dialog()).not.toBeNull(); expect(toggle("go-out").getAttribute("aria-expanded")).toBe("true");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(window.location.search).toBe("?in=thurmont&chapter=go-out");
    expect(toggle("go-out").getAttribute("aria-expanded")).toBe("true");
  });
  it("does not suppress native search navigation inside an existing Tools drawer", async () => {
    host.setAttribute("role", "dialog"); host.setAttribute("aria-modal", "true");
    await render(true); const find = host.querySelector<HTMLAnchorElement>("[data-compass-find]")!;
    const opened = vi.fn(); window.addEventListener("fr:open-search", opened);
    try { await click(find); expect(find.getAttribute("href")).toBe("/search"); expect(opened).not.toHaveBeenCalled(); expect(consumeFindRequest("global")).toBe(false); }
    finally { window.removeEventListener("fr:open-search", opened); }
  });
  it("reuses an outer drawer and closes only its inner index on Escape with opener focus", async () => {
    host.setAttribute("role", "dialog"); host.setAttribute("aria-modal", "true");
    await render(true); const launcher = button("Browse the full tool index");
    await click(launcher); await act(async () => vi.advanceTimersByTimeAsync(32));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector('[data-tool-deck-dialog]')).toBeNull();
    const panel = host.querySelector<HTMLElement>("[data-tool-deck-inline]")!;
    expect(panel).not.toBeNull(); expect(panel.getAttribute("role")).toBe("region");
    const escapedOuter = vi.fn(); window.addEventListener("keydown", escapedOuter);
    try {
      await act(async () => panel.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(escapedOuter).not.toHaveBeenCalled(); expect(window.location.pathname).toBe("/compass"); expect(window.location.search).toBe("");
      expect(host.querySelector("[data-tool-deck-inline]")).toBeNull(); expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      expect(document.activeElement).toBe(launcher);
    } finally { window.removeEventListener("keydown", escapedOuter); }
  });
  it("uses the shared Find bridge and retains a real native search destination", async () => {
    await render();
    const find = host.querySelector<HTMLAnchorElement>("[data-compass-find]")!;
    expect(find).not.toBeNull(); expect(find.getAttribute("href")).toBe("/search");
    expect(host.querySelector('[role="searchbox"]')).toBeNull();
    const opened = vi.fn(); window.addEventListener("fr:open-search", opened);
    try { await click(find); expect(opened).toHaveBeenCalledTimes(1); expect(consumeFindRequest("global")).toBe(true); expect(document.activeElement).toBe(find); }
    finally { window.removeEventListener("fr:open-search", opened); }
  });
  it("does not reroute modified Find activation through the shared bridge", async () => {
    await render(); const find = host.querySelector<HTMLAnchorElement>("[data-compass-find]")!;
    expect(find).not.toBeNull();
    const opened = vi.fn(); window.addEventListener("fr:open-search", opened);
    try {
      await act(async () => find.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
      expect(opened).not.toHaveBeenCalled(); expect(consumeFindRequest("global")).toBe(false);
    } finally { window.removeEventListener("fr:open-search", opened); }
  });
  it("discloses one small action set at a time without creating an overlay", async () => {
    await render(); expect(host.querySelectorAll("[data-compass-intent]")).toHaveLength(4);
    for (const id of ["go-out", "get-around", "local-help", "explore-yours"]) expect(toggle(id).getAttribute("aria-expanded")).toBe("false");
    await click(toggle("go-out"));
    expect(toggle("go-out").getAttribute("aria-expanded")).toBe("true");
    const first = document.getElementById(toggle("go-out").getAttribute("aria-controls")!)!;
    expect(first.hidden).toBe(false);
    expect([...first.querySelectorAll("a")].map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual([
      ["Book a table", "/reserve"], ["Find food trucks", "/food-trucks"], ["Find live music", "/live-music"],
    ]);
    expect(dialog()).toBeNull();
    await click(toggle("get-around"));
    expect(toggle("go-out").getAttribute("aria-expanded")).toBe("false"); expect(first.hidden).toBe(true);
    expect(toggle("get-around").getAttribute("aria-expanded")).toBe("true"); expect(dialog()).toBeNull();
    await click(toggle("get-around")); expect(toggle("get-around").getAttribute("aria-expanded")).toBe("false");
  });
  it("captures the actual touch-style modal opener and restores it on close", async () => {
    await render(); const launcher = button("Browse the full tool index");
    expect(document.activeElement).not.toBe(launcher);
    await click(launcher); expect(dialog()).not.toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(32));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(document.activeElement).toBe(launcher);
  });
  it("keeps tool-only filtering and external provenance inside the deliberate full index", async () => {
    await render(); await click(button("Browse the full tool index"));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    const index = dialog()!; const input = index.querySelector<HTMLInputElement>('[role="searchbox"]')!;
    expect(input).not.toBeNull(); expect(window.location.search).toBe("?deck=all");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(input, "GasBuddy"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    const outside = index.querySelector<HTMLAnchorElement>('a[href^="https://www.gasbuddy.com/"]')!;
    expect(outside).not.toBeNull(); expect(outside.target).toBe("_blank"); expect(outside.rel).toBe("noopener noreferrer");
    expect(outside.textContent).toContain("GasBuddy"); expect(outside.textContent).toContain("Opens in a new tab");
    expect(host.querySelector('[role="searchbox"]')).toBeNull();
  });
  it.each(["food", "go-out", "all"])("preserves the cold legacy deck=%s deep link", async (deck) => {
    window.history.replaceState({}, "", `/compass?deck=${deck}`); await render();
    expect(dialog()).not.toBeNull(); expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(window.location.search).toBe(`?deck=${deck}`);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(window.location.search).toBe("");
  });
  it("retains a selected direct tool in existing recents", async () => {
    await render(); await click(toggle("get-around"));
    const link = intent("get-around").querySelector<HTMLAnchorElement>('a[href="/parking"]')!;
    await click(link);
    expect(JSON.parse(window.localStorage.getItem("fr.compass.recent.v1")!)).toEqual(["/parking"]);
  });
});
