// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Native fixture images expose the real failure signal. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DaypartNeeds from "./DaypartNeeds";
import TodayScopeStatus from "./TodayScopeStatus";
import { getScope, setScope, type Scope } from "@/lib/scope";

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
    expect(container.textContent).toContain("Frederick City picks · Countywide weather");
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


const exhaustionRows = ["restaurant", "brewery", "bar"].map((category) => ({
  category, label: category, href: `/category/${category}`, picks: [],
}));
const unconfirmedRows = ["smoketown-brewing-brunswick", "big-bellys-brunswick", "boxcar-burgers-brunswick", "bandersons-brunswick", "potomac-street-grill-brunswick"]
  .map((slug, index) => ({ slug, name: index === 0 ? "Smoketown Brewing Station" : slug,
    photo: null, where: "Brunswick", distance: null, fact: index === 0 ? "Hours not posted" : "Hours not confirmed" }));
function scopedAnswer(category: string, scope: Scope) {
  const picks = scope === "town:brunswick"
    ? category === "cat:restaurant" ? unconfirmedRows : category === "cat:brewery" ? unconfirmedRows.slice(0, 1) : []
    : [];
  return { hero: picks[0] ?? null, also: picks.slice(1), soon: null,
    browseHref: `/nearby?c=${category.slice(4)}`, contextSource: "town", contextLabel: scope === "town:brunswick" ? "Brunswick" : "Thurmont" };
}
async function renderExhaustion(variant: "brief" | "full" = "brief") {
  await act(async () => root.render(<DaypartNeeds rows={exhaustionRows} variant={variant} />));
}

describe("Today retains a scoped useful answer after checking every category", () => {
  it("returns to the first unconfirmed restaurant after brewery and bar settle without a qualified answer", async () => {
    window.history.replaceState(null, "", "/today?in=brunswick");
    state.answer.mockImplementation(async (category: string, _facet: null, scope: Scope) => scopedAnswer(category, scope));
    await renderExhaustion();
    const card = container.querySelector('[data-today-place-card="lead"]');
    expect(card?.querySelector("[data-today-pick-name]")?.textContent).toBe("Smoketown Brewing Station");
    expect(card?.querySelector("[data-today-pick-fact]")?.textContent).toBe("Hours not posted");
    expect(container.textContent).toContain("Places to try");
    expect(container.textContent).toContain("Brunswick picks · Hours not confirmed; call ahead");
    expect(container.textContent).not.toContain("Places open now");
    expect(state.answer.mock.calls).toEqual(["cat:restaurant", "cat:brewery", "cat:bar"].map((category) => [category, null, "town:brunswick"]));
    const action = card?.querySelector<HTMLAnchorElement>("[data-today-place-lead]");
    expect(new URL(action!.href).searchParams.get("returnTo")).toBe("/today?in=brunswick");
    await renderExhaustion();
    await act(async () => { await Promise.resolve(); });
    expect(state.answer).toHaveBeenCalledTimes(3);
    expect(container.querySelector("[data-today-pick-name]")?.textContent).toBe("Smoketown Brewing Station");
  });

  it("clears retained Brunswick shelves before an empty Thurmont context can reuse them", async () => {
    window.history.replaceState(null, "", "/today?in=brunswick");
    state.answer.mockImplementation(async (category: string, _facet: null, scope: Scope) => scopedAnswer(category, scope));
    await renderExhaustion();
    expect(container.textContent).toContain("Smoketown Brewing Station");
    await act(async () => {
      window.history.replaceState(null, "", "/today?in=thurmont");
      setScope("town:thurmont");
    });
    expect(state.answer.mock.calls.slice(3)).toEqual(["cat:restaurant", "cat:brewery", "cat:bar"].map((category) => [category, null, "town:thurmont"]));
    expect(state.answer).toHaveBeenCalledTimes(6);
    expect(container.querySelector("[data-today-place-preview], [data-today-opening-soon-preview]")).toBeNull();
    expect(container.textContent).not.toContain("Smoketown Brewing Station");
    expect(container.textContent).not.toContain("Brunswick");
    expect(container.textContent).toContain("Thurmont");
  });

  it("rejects an old context response queued during the scope-change handoff", async () => {
    let releaseOld!: (value: ReturnType<typeof scopedAnswer>) => void;
    window.history.replaceState(null, "", "/today?in=county");
    state.answer.mockImplementation((category: string, _facet: null, scope: Scope) => scope === "county"
      ? new Promise((resolve) => { releaseOld = resolve; })
      : Promise.resolve(scopedAnswer(category, scope)));
    await renderExhaustion();
    await act(async () => {
      window.history.replaceState(null, "", "/today?in=thurmont");
      setScope("town:thurmont");
      releaseOld({ ...scopedAnswer("cat:restaurant", "town:brunswick"), contextLabel: "Old county response" });
      await Promise.resolve();
    });
    expect(state.answer.mock.calls).toEqual([["cat:restaurant", null, "county"],
      ...["cat:restaurant", "cat:brewery", "cat:bar"].map((category) => [category, null, "town:thurmont"])]);
    expect(container.textContent).toContain("Thurmont");
    expect(container.textContent).not.toContain("Old county response");
    expect(container.textContent).not.toContain("Smoketown Brewing Station");
    expect(container.querySelector("[data-today-place-preview]")).toBeNull();
  });

  it("refetches new server rows in the same instance without painting the previous live shelf", async () => {
    window.history.replaceState(null, "", "/today?in=brunswick");
    state.answer.mockImplementation(async (category: string, _facet: null, scope: Scope) => scopedAnswer(category, scope));
    await renderExhaustion();
    expect(container.textContent).toContain("Smoketown Brewing Station");
    expect(state.answer).toHaveBeenCalledTimes(3);
    let releaseFresh!: (value: ReturnType<typeof scopedAnswer>) => void;
    state.answer.mockImplementation(() => new Promise((resolve) => { releaseFresh = resolve; }));
    const freshRows = exhaustionRows.map((row) => ({ ...row, picks: row.category === "restaurant"
      ? [{ slug: "new-server-place", name: "New server place", rating: null, confidence: "unconfirmed" as const, fact: "Hours not confirmed" }] : [] }));
    await act(async () => root.render(<DaypartNeeds rows={freshRows} variant="brief" />));
    expect(state.answer).toHaveBeenCalledTimes(4);
    expect(state.answer.mock.calls[3]).toEqual(["cat:restaurant", null, "town:brunswick"]);
    expect(container.textContent).toContain("New server place");
    expect(container.textContent).not.toContain("Smoketown Brewing Station");
    await act(async () => releaseFresh({ ...scopedAnswer("cat:restaurant", "town:brunswick"),
      hero: { ...unconfirmedRows[0], slug: "fresh-confirmed", name: "Fresh confirmed place", fact: "Open until 8pm", confidence: "confirmed" } } as ReturnType<typeof scopedAnswer>));
    expect(container.textContent).toContain("Fresh confirmed place");
    expect(container.textContent).not.toContain("New server place");
    await act(async () => root.render(<DaypartNeeds rows={freshRows} variant="brief" />));
    expect(state.answer).toHaveBeenCalledTimes(4);
  });

  it("rejects an old pending response after a new server-rows revision", async () => {
    window.history.replaceState(null, "", "/today?in=brunswick");
    let releaseOld!: (value: ReturnType<typeof scopedAnswer>) => void;
    let releaseFresh!: (value: ReturnType<typeof scopedAnswer>) => void;
    state.answer.mockImplementationOnce(() => new Promise((resolve) => { releaseOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFresh = resolve; }));
    await renderExhaustion();
    const freshRows = exhaustionRows.map((row) => ({ ...row }));
    await act(async () => root.render(<DaypartNeeds rows={freshRows} variant="brief" />));
    expect(state.answer).toHaveBeenCalledTimes(2);
    await act(async () => releaseFresh({ ...scopedAnswer("cat:restaurant", "town:brunswick"),
      hero: { ...unconfirmedRows[0], slug: "fresh-revision", name: "Fresh revision place", fact: "Open until 8pm", confidence: "confirmed" } } as ReturnType<typeof scopedAnswer>));
    expect(container.textContent).toContain("Fresh revision place");
    await act(async () => releaseOld(scopedAnswer("cat:restaurant", "town:brunswick")));
    expect(container.textContent).toContain("Fresh revision place");
    expect(container.textContent).not.toContain("Smoketown Brewing Station");
    expect(state.answer).toHaveBeenCalledTimes(2);
  });

  it("invalidates full-mode evidence when the same rows switch to a brief decision", async () => {
    window.history.replaceState(null, "", "/today?in=brunswick");
    state.answer.mockImplementation(async (category: string, _facet: null, scope: Scope) => scopedAnswer(category, scope));
    await renderExhaustion("full");
    expect(state.answer).toHaveBeenCalledTimes(1);
    await renderExhaustion("brief");
    expect(state.answer.mock.calls.map((call) => call[0])).toEqual(["cat:restaurant", "cat:restaurant", "cat:brewery", "cat:bar"]);
    expect(container.querySelector("[data-today-pick-name]")?.textContent).toBe("Smoketown Brewing Station");
    await renderExhaustion("brief");
    expect(state.answer).toHaveBeenCalledTimes(4);
  });

  it("refetches a valid manually selected full-mode category after server rows refresh", async () => {
    window.history.replaceState(null, "", "/today?in=brunswick");
    state.answer.mockImplementation(async (category: string, _facet: null, scope: Scope) => scopedAnswer(category, scope));
    await renderExhaustion("full");
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent === "bar")!.click());
    const freshRows = exhaustionRows.map((row) => ({ ...row }));
    await act(async () => root.render(<DaypartNeeds rows={freshRows} variant="full" />));
    expect(state.answer.mock.calls.map((call) => call[0])).toEqual(["cat:restaurant", "cat:bar", "cat:bar"]);
    expect([...container.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "bar")?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector("[data-today-pick-name]")).toBeNull();
  });

  it("keeps a manually selected empty comparison category authoritative", async () => {
    window.history.replaceState(null, "", "/today?in=brunswick");
    state.answer.mockImplementation(async (category: string, _facet: null, scope: Scope) => scopedAnswer(category, scope));
    await renderExhaustion("full");
    const bar = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent === "bar")!;
    await act(async () => bar.click());
    expect(bar.getAttribute("aria-selected")).toBe("true");
    expect(state.answer.mock.calls.map((call) => call[0])).toEqual(["cat:restaurant", "cat:bar"]);
    expect(container.querySelector("[data-today-pick-name]")).toBeNull();
  });
});
