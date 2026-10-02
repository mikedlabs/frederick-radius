// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DaypartNeeds from "./DaypartNeeds";
import TodayScopeStatus from "./TodayScopeStatus";
import { getScope, type Scope } from "@/lib/scope";

const state = vi.hoisted(() => ({
  request: vi.fn(),
  requestIfGranted: vi.fn(),
  answer: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/hooks/useGeolocation", () => ({
  GEOLOCATION_CHANGE_EVENT: "fr:geolocation-change",
  readCachedPosition: () => null,
  useGeolocation: () => ({ state: { status: "idle" }, request: state.request, requestIfGranted: state.requestIfGranted }),
}));
vi.mock("@/lib/want-cache", () => ({ getWantAnswer: state.answer }));
vi.mock("@/lib/offline-snapshot", () => ({ persistOfflineTodaySnapshot: async () => {} }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let storage: Map<string, string>;
const rows = [{ category: "coffee", label: "Coffee", href: "/nearby?c=coffee", picks: [] }];

beforeEach(() => {
  storage = new Map();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  document.cookie = "fr_scope=; path=/; max-age=0";
  window.history.replaceState(null, "", "/today");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  state.answer.mockReset();
  state.request.mockClear();
  state.requestIfGranted.mockClear();
  state.answer.mockImplementation(async (_category: string, _facet: null, scope: Scope) => ({
    hero: { slug: "listed-cafe", name: "Listed cafe", photo: null, where: "Frederick", distance: null, fact: "Hours not confirmed", confidence: "unconfirmed" },
    also: [], later: [], notable: [],
    contextSource: scope === "county" ? "county" : "town",
    contextLabel: scope === "county" ? "Whole county" : "Frederick City",
    browseHref: "/nearby?c=coffee",
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.cookie = "fr_scope=; path=/; max-age=0";
  vi.restoreAllMocks();
});

async function render() {
  await act(async () => { root.render(<><TodayScopeStatus /><DaypartNeeds rows={rows} variant="brief" /></>); });
}

describe("Today hydrated scope agrees with its area control", () => {
  it("uses explicit county for an unset visitor and retains it in the browse link", async () => {
    await render();
    expect(container.querySelector("select")?.value).toBe("county");
    expect(container.textContent).toContain("Countywide briefing");
    expect(container.textContent).not.toContain("Frederick City picks");
    expect(state.answer).toHaveBeenCalledWith("cat:coffee", null, "county");
    expect(container.querySelector('a[href="/nearby?c=coffee&in=county"]')).not.toBeNull();
    expect(state.request).not.toHaveBeenCalled();
    expect(state.requestIfGranted).not.toHaveBeenCalled();
  });

  it("recovers a saved cookie town in both the control and its place request", async () => {
    document.cookie = "fr_scope=town%3Afrederick; path=/";
    await render();
    expect(getScope()).toBe("town:frederick");
    expect(container.querySelector("select")?.value).toBe("town:frederick");
    expect(container.textContent).toContain("Frederick City place picks");
    expect(state.answer).toHaveBeenCalledWith("cat:coffee", null, "town:frederick");
    expect(container.querySelector('a[href="/nearby?c=coffee&in=frederick"]')).not.toBeNull();
  });

  it("honors an explicit county URL despite a stale city cookie", async () => {
    document.cookie = "fr_scope=town%3Afrederick; path=/";
    window.history.replaceState(null, "", "/today?in=county");
    await render();
    expect(container.querySelector("select")?.value).toBe("county");
    expect(state.answer.mock.calls.every((call) => call[2] === "county")).toBe(true);
    expect(container.querySelector('a[href="/nearby?c=coffee&in=county"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Frederick City picks");
  });
});
