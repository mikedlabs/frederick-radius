// @vitest-environment jsdom
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(
    (notify) => { window.addEventListener("test-next-url", notify); return () => window.removeEventListener("test-next-url", notify); },
    () => window.location.search,
    () => "",
  )),
}));
vi.mock("@/hooks/useGeolocation", () => ({ useGeolocation: () => ({ state: { status: "idle" }, request: vi.fn() }) }));
vi.mock("next/link", () => ({ default: "a" }));
import LocationChip from "./LocationChip";
import { getScope, SCOPE_CHANGE_EVENT } from "@/lib/scope";
import { installNativeReturnOwner, NATIVE_REQUEST_ENTRY_KEY, rememberNativeRequest } from "@/components/search/native-request-return";

let root: Root;
let host: HTMLDivElement;
let originalReplace: History["replaceState"];
let release: () => void;
let synchronized: number;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); synchronized = 0;
  window.localStorage.clear(); document.cookie = "fr_scope=county; path=/";
  originalReplace = window.history.replaceState;
  originalReplace.call(window.history, { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { retain: "exact tree" }, marker: "retained" }, "", "/compass?in=county&chapter=go-out&q=coffee#tools");
  // Model the installed Next16 native-history loop-marker boundary. This
  // consumer test is not a substitute for the real compiled route journey.
  window.history.replaceState = function (data, unused, url) {
    if (data?.__NA || data?._N) return originalReplace.call(this, data, unused, url);
    const existing = window.history.state;
    originalReplace.call(this, { ...data, __NA: existing.__NA, __PRIVATE_NEXTJS_INTERNALS_TREE: existing.__PRIVATE_NEXTJS_INTERNALS_TREE }, unused, url);
    if (url) { synchronized++; window.dispatchEvent(new Event("test-next-url")); }
  };
  release = installNativeReturnOwner();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); release(); window.history.replaceState = originalReplace;
  window.localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks();
});
async function click(node: HTMLElement) { await act(async () => node.click()); }
function button(text: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === text)!; }
async function selectThurmont() {
  await act(async () => root.render(<LocationChip />));
  await click(host.querySelector<HTMLButtonElement>('button[aria-controls="location-scope-choices"]')!);
  await click(host.querySelector<HTMLButtonElement>("[data-town-disclosure]")!);
  await click(button("Thurmont"));
}

describe("native Compass location ownership", () => {
  it("keeps the workspace and Next URL consumer mounted with one actual scope change", async () => {
    rememberNativeRequest({ draft: { kind: "tools", query: "coffee" }, target: "tool-filter" });
    const id = window.history.state[NATIVE_REQUEST_ENTRY_KEY].id;
    const scopes: unknown[] = []; const changed = (event: Event) => scopes.push((event as CustomEvent).detail.scope);
    window.addEventListener(SCOPE_CHANGE_EVENT, changed);
    try { await selectThurmont(); } finally { window.removeEventListener(SCOPE_CHANGE_EVENT, changed); }
    expect(navigation.replace).not.toHaveBeenCalled(); expect(navigation.refresh).not.toHaveBeenCalled();
    expect(synchronized).toBe(1); expect(window.location.pathname + window.location.search + window.location.hash).toBe("/compass?in=thurmont&chapter=go-out&q=coffee#tools");
    expect(getScope()).toBe("town:thurmont"); expect(scopes).toEqual(["town:thurmont"]);
    expect(host.querySelector('[data-location-scope-label="full"]')?.textContent).toBe("Thurmont");
    expect(window.history.state).toMatchObject({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { retain: "exact tree" }, marker: "retained" });
    expect(window.history.state[NATIVE_REQUEST_ENTRY_KEY]).toMatchObject({ id, href: "/compass?in=thurmont&chapter=go-out&q=coffee#tools", draft: { query: "coffee" } });
    expect(host.querySelector("[data-location-scope-menu]")).toBeNull();
  });
  it("keeps the existing map native refinement and other server-route navigation", async () => {
    originalReplace.call(window.history, {}, "", "/map?in=county&q=coffee#map");
    await selectThurmont(); expect(navigation.replace).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/map?in=thurmont&q=coffee#map");
    await act(async () => root.unmount()); root = createRoot(host);
    originalReplace.call(window.history, {}, "", "/events?in=county&when=today#events");
    await selectThurmont(); expect(navigation.replace).toHaveBeenCalledWith("/events?in=thurmont&when=today#events", { scroll: false });
  });
});
