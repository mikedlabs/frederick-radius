// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Native fixture images expose the real failure signal. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DaypartNeeds from "./DaypartNeeds";
import TodayScopeStatus from "./TodayScopeStatus";
import { getScope, type Scope } from "@/lib/scope";
import type { DaypartPick, DaypartRow } from "@/lib/loaders/daypartPicks";

const state = vi.hoisted(() => ({
  request: vi.fn(),
  requestIfGranted: vi.fn(),
  answer: vi.fn(),
}));
const photoHandlers = vi.hoisted(() => new Map<string, Pick<React.ImgHTMLAttributes<HTMLImageElement>, "onLoad" | "onError">>());
vi.mock("next/image", () => ({ default: ({ src, alt = "", onLoad, onError }: { src: string; alt?: string; onLoad?: React.ReactEventHandler<HTMLImageElement>; onError?: React.ReactEventHandler<HTMLImageElement> }) => {
  photoHandlers.set(src, { onLoad, onError });
  return <img src={src} alt={alt} onLoad={onLoad} onError={onError} />;
} }));
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
  photoHandlers.clear();
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

async function decodePhoto(image: HTMLImageElement, width = 600, height = 400) {
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  });
  await act(async () => image.dispatchEvent(new Event("load")));
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
  it.each(["load", "error"])("keeps credits outside the place action and preserves the decision after image %s failure", async (failure) => {
    const photoName = "places/local-id/photos/exact-photo";
    const raw = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;
    const source = "https://www.google.com/maps/contrib/123/photo/456";
    state.answer.mockResolvedValue({ hero: { slug: "local-place", name: "Local place", photo: raw, where: "Brunswick", distance: "6 min walk", fact: "Hours not confirmed", confidence: "unconfirmed" }, also: [], soon: null, browseHref: "/nearby?c=coffee&in=brunswick", contextLabel: "Brunswick", contextSource: "town" });
    const request = vi.fn(async () => new Response(JSON.stringify({ place: { slug: "local-place", google_photo_url: raw, google_photo_attribution: { photo_name: photoName, google_maps_uri: source, authors: [{ display_name: "Local photographer", uri: "https://www.google.com/maps/contrib/123" }] } } })));
    vi.stubGlobal("fetch", request);
    await render();
    const photo = container.querySelector("img")!;
    expect(photo).not.toBeNull();
    expect(photo.getAttribute("src")).toContain("w=720");
    expect(photo.getAttribute("src")).toContain("fallback=signal");
    expect(container.querySelector('a[href="/places/local-place"] a')).toBeNull();
    expect(container.querySelector(`a[href="${source}"]`)).toBeNull();
    await decodePhoto(photo);
    expect(container.querySelector(`a[href="${source}"]`)?.textContent).toBe("Google Maps");
    expect(request).toHaveBeenCalledTimes(1);
    Object.defineProperty(photo, "naturalWidth", { configurable: true, value: 1 });
    Object.defineProperty(photo, "naturalHeight", { configurable: true, value: 1 });
    await act(async () => photo.dispatchEvent(new Event(failure)));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("Local photographer");
    const placeLink = container.querySelector('a[href="/places/local-place"]');
    expect(placeLink?.textContent).toContain("Local place");
    expect(placeLink?.textContent).toContain("Hours not confirmed");
    expect(placeLink?.textContent).toContain("Brunswick · 6 min walk");
    expect(container.textContent).toContain("Places to try");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("Today canonical exact-place media", () => {
  const photoName = "places/local-id/photos/exact-photo";
  const photo = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;
  const attribution = { photo_name: photoName, google_maps_uri: "https://www.google.com/maps/contrib/123/photo/456", authors: [{ display_name: "Exact photo contributor" }] };
  const creek = { slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park" };
  const baker = { slug: "baker-park-frederick", name: "Baker Park" };
  const pick = (place = creek, overrides: Partial<DaypartPick> = {}): DaypartPick => ({
    ...place, rating: null, confidence: "unconfirmed", fact: "Hours not confirmed", where: "Frederick", photo: null, ...overrides,
  });
  async function shelf(picks: DaypartPick[], options: { openingSoon?: DaypartPick; variant?: "brief" | "full" } = {}) {
    // Keep the supplied canonical fixture selected; this suite tests media,
    // not the ranker. jsdom never retrieves the remote image pixels.
    state.answer.mockImplementation(() => new Promise(() => {}));
    const row: DaypartRow = { category: "park", label: "Parks", href: "/nearby?c=park", picks, openingSoon: options.openingSoon };
    await act(async () => root.render(<DaypartNeeds rows={[row]} variant={options.variant ?? "brief"} />));
  }
  const image = () => container.querySelector<HTMLImageElement>("img")!;
  const fail = async () => act(async () => image().dispatchEvent(new Event("error")));

  it("resolves the owned Creek image from its exact slug when the old Google-only field is empty", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await shelf([pick()]);
    expect(image()?.getAttribute("src")).toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    expect(image().alt).toBe("Carroll Creek in Frederick.");
    await decodePhoto(image());
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(container.textContent).toContain("Hours not confirmed");
    expect(request).not.toHaveBeenCalled();
  });

  it("uses decoded exact Commons imagery and full source credit before an uncredited Google candidate", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await shelf([pick(baker, { photo })]);
    expect(container.querySelector('[data-today-photo-source="curated"]')).not.toBeNull();
    expect(new URL(image().getAttribute("src")!).searchParams.get("width")).toBe("720");
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    await decodePhoto(image());
    expect(container.textContent).toContain("Photo by Acroterion.");
    expect(container.textContent).toContain("Cropped for display.");
    expect(container.querySelector('a[href="https://commons.wikimedia.org/wiki/File:Baker_Park_Swinging_Bridge_Frederick_MD2.jpg"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://creativecommons.org/licenses/by-sa/4.0"]')).not.toBeNull();
    expect(container.querySelector('a[href="/places/baker-park-frederick"] a')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps exhausted free sources failed when late exact Google credit expands the same plan", async () => {
    let releaseCredit!: (response: Response) => void;
    const request = vi.fn(() => new Promise<Response>((resolve) => { releaseCredit = resolve; }));
    vi.stubGlobal("fetch", request);
    await shelf([pick(creek, { photo })]);
    const ownedSrc = image().getAttribute("src")!;
    const oldOwned = photoHandlers.get(ownedSrc)!;
    await fail();
    expect(container.querySelector('[data-today-photo-source="curated"]')).not.toBeNull();
    expect(request).not.toHaveBeenCalled();
    const curatedSrc = image().getAttribute("src")!;
    const oldCurated = photoHandlers.get(curatedSrc)!;
    await decodePhoto(image());
    expect(container.textContent).toContain("Photo by Acroterion.");
    await fail();
    expect(image()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(request).toHaveBeenCalledExactlyOnceWith(`/api/places/map-card/${creek.slug}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await act(async () => releaseCredit(new Response(JSON.stringify({ place: { slug: creek.slug, google_photo_url: photo, google_photo_attribution: attribution } }))));
    expect(container.querySelector('[data-today-photo-source="google"]')).not.toBeNull();
    expect(image().getAttribute("src")).toContain("w=720");
    expect(image().getAttribute("src")).toContain("fallback=signal");
    const googleSrc = image().getAttribute("src");
    await act(async () => {
      oldOwned.onLoad?.({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as React.SyntheticEvent<HTMLImageElement>);
      oldCurated.onError?.({} as React.SyntheticEvent<HTMLImageElement>);
    });
    expect(image().getAttribute("src")).toBe(googleSrc);
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    await decodePhoto(image());
    expect(container.textContent).toContain("Exact photo contributor");
    expect(container.textContent).not.toContain("Acroterion");
    await fail();
    expect(image()).toBeNull();
    await act(async () => oldCurated.onLoad?.({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as React.SyntheticEvent<HTMLImageElement>));
    expect(image()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(container.querySelector(`a[href="/places/${creek.slug}"]`)?.textContent).toContain("Hours not confirmed");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not revive the known unsuitable Google photo when preferred curated imagery fails", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const furnace = { slug: "catoctin-furnace-thurmont", name: "Catoctin Furnace" };
    await shelf([pick(furnace, { photo })]);
    expect(container.querySelector('[data-today-photo-source="curated"]')).not.toBeNull();
    await fail();
    expect(image()).toBeNull();
    expect(container.querySelector(`a[href="/places/${furnace.slug}"]`)).not.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("retains a decoded Commons credit when a refresh changes only the unused Google fallback", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await shelf([pick(baker, { photo })]);
    await decodePhoto(image());
    const decoded = image();
    await shelf([pick(baker, { photo: null })]);
    expect(image()).toBe(decoded);
    expect(container.textContent).toContain("Photo by Acroterion.");
    expect(request).not.toHaveBeenCalled();
  });

  it("does not retry exhausted Commons imagery when the same place gets a new Google candidate", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await shelf([pick(baker, { photo, photoAttribution: attribution })], { variant: "full" });
    await fail();
    expect(container.querySelector('[data-today-photo-source="google"]')).not.toBeNull();
    const nextName = "places/local-id/photos/replacement-photo";
    const nextPhoto = `/api/place-photo?name=${encodeURIComponent(nextName)}&w=800`;
    await shelf([pick(baker, { photo: nextPhoto, photoAttribution: { ...attribution, photo_name: nextName } })], { variant: "full" });
    expect(container.querySelector('[data-today-photo-source="google"]')).not.toBeNull();
    expect(image().getAttribute("src")).toContain(encodeURIComponent(nextName));
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("ignores old source callbacks after the actual selected destination changes", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await shelf([pick()]);
    const old = photoHandlers.get(image().getAttribute("src")!)!;
    await shelf([pick(baker)]);
    const current = image().getAttribute("src");
    await act(async () => {
      old.onError?.({} as React.SyntheticEvent<HTMLImageElement>);
      old.onLoad?.({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as React.SyntheticEvent<HTMLImageElement>);
    });
    expect(image().getAttribute("src")).toBe(current);
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    await decodePhoto(image());
    expect(container.textContent).toContain("Photo by Acroterion.");
    expect(container.querySelector(`a[href="/places/${baker.slug}"]`)).not.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("does not borrow old Google load state or credit when the raw photo changes", async () => {
    const venue = { slug: "mcclintocks-back-bar", name: "McClintock's Back Bar" };
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await shelf([pick(venue, { photo, photoAttribution: attribution })], { variant: "full" });
    const old = photoHandlers.get(image().getAttribute("src")!)!;
    await decodePhoto(image());
    const nextName = "places/local-id/photos/replacement-photo";
    const nextPhoto = `/api/place-photo?name=${encodeURIComponent(nextName)}&w=800`;
    const nextCredit = { ...attribution, photo_name: nextName, authors: [{ display_name: "Replacement photo contributor" }] };
    await shelf([pick(venue, { photo: nextPhoto, photoAttribution: nextCredit })], { variant: "full" });
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    await act(async () => {
      old.onError?.({} as React.SyntheticEvent<HTMLImageElement>);
      old.onLoad?.({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as React.SyntheticEvent<HTMLImageElement>);
    });
    expect(image().getAttribute("src")).toContain(encodeURIComponent(nextName));
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    await decodePhoto(image());
    expect(container.textContent).toContain("Replacement photo contributor");
    expect(container.textContent).not.toContain("Exact photo contributor");
    expect(request).not.toHaveBeenCalled();
  });

  it("re-decodes a same-URL photo before displaying changed credit metadata", async () => {
    const venue = { slug: "mcclintocks-back-bar", name: "McClintock's Back Bar" };
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await shelf([pick(venue, { photo, photoAttribution: attribution })], { variant: "full" });
    const old = photoHandlers.get(image().getAttribute("src")!)!;
    await decodePhoto(image());
    const nextCredit = { ...attribution, authors: [{ display_name: "Updated exact credit" }] };
    await shelf([pick(venue, { photo, photoAttribution: nextCredit })], { variant: "full" });
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    await act(async () => old.onLoad?.({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as React.SyntheticEvent<HTMLImageElement>));
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    await decodePhoto(image());
    expect(container.textContent).toContain("Updated exact credit");
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps opening-soon facts and a 192px source request through transparent Commons failure", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await shelf([], { openingSoon: pick(baker, { confidence: "confirmed", fact: "Opens soon · 9am" }) });
    expect(new URL(image().getAttribute("src")!).searchParams.get("width")).toBe("384");
    await decodePhoto(image());
    expect(container.querySelector(".place-card-photo-credit")).not.toBeNull();
    expect(container.querySelector('[data-today-opening-soon="true"] a')).toBeNull();
    await decodePhoto(image(), 1, 600);
    expect(image()).toBeNull();
    expect(container.querySelector(".place-card-photo-credit")).toBeNull();
    expect(container.querySelector('[data-today-opening-soon="true"]')?.textContent).toContain("Opens soon · 9am");
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps missing/uncertified photos factual and does not hydrate comparison cards", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const venue = { slug: "mcclintocks-back-bar", name: "McClintock's Back Bar" };
    await shelf([pick(venue, { photo }), pick({ slug: "unrelated-place", name: "Another real candidate" }, { photo: "https://places.googleapis.com/v1/places/local/photos/direct/media" })], { variant: "full" });
    expect(image()).toBeNull();
    expect(container.textContent).toContain(venue.name);
    expect(container.textContent).toContain("Another real candidate");
    expect(container.textContent).toContain("Hours not confirmed");
    expect(request).not.toHaveBeenCalled();
  });
});
