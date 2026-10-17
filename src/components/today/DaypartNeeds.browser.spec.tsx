// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Native fixture images expose the real failure signal. */
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
vi.mock("next/image", () => ({ default: ({ src, onLoad, onError }: { src: string; onLoad?: React.ReactEventHandler<HTMLImageElement>; onError?: React.ReactEventHandler<HTMLImageElement> }) => <img src={src} alt="" onLoad={onLoad} onError={onError} /> }));
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
  vi.unstubAllGlobals();
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


describe("Today place photo preserves the decision and exact source", () => {
  it.each(["load", "error"])("keeps paid bytes deferred and preserves facts after image %s failure", async (failure) => {
    const photoName = "places/local-id/photos/exact-photo";
    const raw = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;
    const source = "https://www.google.com/maps/contrib/123/photo/456";
    state.answer.mockResolvedValue({ hero: { slug: "local-place", name: "Local place", photo: raw, where: "Brunswick", distance: "6 min walk", fact: "Hours not confirmed", confidence: "unconfirmed" }, also: [], soon: null, browseHref: "/nearby?c=coffee&in=brunswick", contextLabel: "Brunswick", contextSource: "town" });
    vi.stubGlobal("IntersectionObserver", class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) { this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
      disconnect() {}
      unobserve() {}
    });
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn(() => "blob:today-visible-photo");
      static revokeObjectURL = vi.fn();
    });
    const request = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url.startsWith("/api/places/map-card/")
        ? new Response(JSON.stringify({ place: { slug: "local-place", google_photo_url: raw, google_photo_attribution: { photo_name: photoName, google_maps_uri: source, authors: [{ display_name: "Local photographer", uri: "https://www.google.com/maps/contrib/123" }] } } }))
        : new Response(new Blob(["photo-bytes"], { type: "image/jpeg" }), { headers: { "Content-Type": "image/jpeg" } });
    });
    vi.stubGlobal("fetch", request);
    await render();
    const photo = container.querySelector("img")!;
    expect(photo).not.toBeNull();
    expect(photo.getAttribute("src")).toBe("blob:today-visible-photo");
    expect(request.mock.calls[1][0]).toContain("w=720");
    expect(request.mock.calls[1][0]).toContain("fallback=signal");
    expect(container.querySelector("a a")).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
    Object.defineProperties(photo, { naturalWidth: { configurable: true, value: 600 }, naturalHeight: { configurable: true, value: 400 } });
    await act(async () => photo.dispatchEvent(new Event("load")));
    expect(container.querySelector(`.place-card-photo-credit a[href="${source}"]`)?.textContent).toBe("Google Maps");
    Object.defineProperties(photo, { naturalWidth: { configurable: true, value: 1 }, naturalHeight: { configurable: true, value: 1 } });
    await act(async () => photo.dispatchEvent(new Event(failure)));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("Local photographer");
    const card = container.querySelector('[data-today-place-card="lead"]');
    expect(card?.textContent).toContain("Local place");
    expect(card?.textContent).toContain("Hours not confirmed");
    expect(card?.textContent).toContain("Brunswick · 6 min walk");
    expect(card?.querySelector('[data-today-place-lead]')?.getAttribute("href")).toContain("/places/local-place?returnTo=");
    expect(container.textContent).toContain("Places to try");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
