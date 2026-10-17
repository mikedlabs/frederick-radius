// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Native fixture images expose decode and failure events. */
import { act, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaypartPick } from "@/lib/loaders/daypartPicks";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";
import TodayPlacePreview from "./TodayPlacePreview";

type PhotoHandlers = Pick<ImgHTMLAttributes<HTMLImageElement>, "onLoad" | "onError">;
const photoHandlers = vi.hoisted(() => new Map<string, PhotoHandlers>());
const routing = vi.hoisted(() => ({ suspend: false }));
vi.mock("next/image", () => ({
  default: ({ src, alt = "", onLoad, onError }: { src: string; alt?: string } & PhotoHandlers) => {
    photoHandlers.set(src, { onLoad, onError });
    return <img src={src} alt={alt} onLoad={onLoad} onError={onError} />;
  },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => {
    if (routing.suspend) throw new Promise(() => {});
    return new URLSearchParams(window.location.search);
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const photoName = "places/today-preview/photos/exact-photo";
const rawPhoto = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;
const googleSource = "https://www.google.com/maps/contrib/123/photo/456";
const attribution = {
  photo_name: photoName,
  google_maps_uri: googleSource,
  authors: [{ display_name: "Exact photo contributor", uri: "https://www.google.com/maps/contrib/123" }],
};
const schifferstadt = CREDITED_LOCAL_PLACE_PHOTOS["schifferstadt-architectural-museum-frederick"].image;
const pick = (overrides: Partial<DaypartPick> = {}): DaypartPick => ({
  slug: "unregistered-preview-place", name: "A real local place", rating: null,
  confidence: "unconfirmed", fact: "Hours not confirmed", where: "Brunswick", distance: "6 min walk",
  photo: null, ...overrides,
});
// Display bytes are synthetic; jsdom never retrieves a real provider image.
const byteResponse = () => new Response(new Blob(["synthetic-preview-photo"], { type: "image/jpeg" }), {
  headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
});

describe("Today place preview exact media and actions", () => {
  let root: Root;
  let container: HTMLDivElement;
  let enter: Array<() => void>;
  let create: ReturnType<typeof vi.fn<(object: Blob | MediaSource) => string>>;

  beforeEach(() => {
    routing.suspend = false;
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } });
    document.cookie = "fr_scope=; path=/; max-age=0";
    window.history.replaceState(null, "", "/today?in=brunswick&view=morning");
    photoHandlers.clear();
    enter = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) {
        enter.push(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
      }
      observe() {}
      disconnect() {}
    });
    create = vi.fn<(object: Blob | MediaSource) => string>().mockImplementation(() => `blob:today-preview-${create.mock.calls.length}`);
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = vi.fn<(url: string) => void>();
    });
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

  async function render(place: DaypartPick, hydratePhoto = false) {
    await act(async () => root.render(<TodayPlacePreview place={place} category="museum" hydratePhoto={hydratePhoto} />));
  }
  const image = () => container.querySelector<HTMLImageElement>("img");
  const credit = () => container.querySelector<HTMLElement>(".place-card-photo-credit");
  async function decode(target: HTMLImageElement, width = 600, height = 400) {
    Object.defineProperties(target, {
      naturalWidth: { configurable: true, value: width },
      naturalHeight: { configurable: true, value: height },
    });
    await act(async () => target.dispatchEvent(new Event("load")));
  }
  function expectActions(place: DaypartPick, origin = "/today?in=brunswick&view=morning") {
    const detail = container.querySelector<HTMLAnchorElement>(`a[aria-label="View place: ${place.name}"]`)!;
    const map = container.querySelector<HTMLAnchorElement>(`a[aria-label="Map: ${place.name}"]`)!;
    expect(detail).not.toBeNull();
    expect(map).not.toBeNull();
    const detailUrl = new URL(detail.href);
    const mapUrl = new URL(map.href);
    expect(detailUrl.pathname).toBe(`/places/${place.slug}`);
    expect(detailUrl.searchParams.get("returnTo")).toBe(origin);
    expect(mapUrl.pathname).toBe("/map");
    expect(mapUrl.searchParams.get("place")).toBe(place.slug);
    expect(mapUrl.searchParams.get("in")).toBe(new URL(origin, "https://example.test").searchParams.get("in"));
    expect(mapUrl.searchParams.get("returnTo")).toBe(origin);
    expect(detail.querySelector("a")).toBeNull();
    expect(map.querySelector("a")).toBeNull();
  }

  it("keeps the full factual first paint and real native actions when URL parameters suspend", () => {
    const place = pick({ slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt" });
    routing.suspend = true;
    let html: string;
    try {
      // No outer boundary is supplied: only the component's action boundary
      // may catch the request-specific hook during the cached first paint.
      html = renderToStaticMarkup(<TodayPlacePreview place={place} category="museum" />);
    } finally {
      routing.suspend = false;
    }
    expect(html).toContain('data-today-place-preview="true"');
    expect(html).toContain('data-preview-layout="exact"');
    expect(html).toContain(`src="${schifferstadt.src}"`);
    expect(html).toContain("Schifferstadt");
    expect(html).toContain("Hours not confirmed");
    expect(html).toContain("Brunswick · 6 min walk");
    expect(html).toContain(`href="/places/${place.slug}"`);
    expect(html).toContain(`href="/map?place=${place.slug}"`);
    expect(html).toContain('aria-label="View place: Schifferstadt"');
    expect(html).toContain('aria-label="Map: Schifferstadt"');
    expect(html).not.toContain("returnTo=");
    expect(html).not.toContain("in=county");
  });

  it("uses the exact owned Creek image without hydrating an unused Google candidate", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const place = pick({ slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek Linear Park", photo: rawPhoto });
    await render(place, true);
    expect(image()?.getAttribute("src")).toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    expect(image()?.alt).toBe("Carroll Creek in Frederick.");
    await decode(image()!);
    expect(credit()).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Hours not confirmed");
    expect(container.textContent).toContain("Brunswick · 6 min walk");
    expectActions(place);
  });

  it("shows the local exact Commons source and complete credit only after decode", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const place = pick({ slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt", photo: rawPhoto });
    await render(place, true);
    expect(image()?.getAttribute("src")).toBe(schifferstadt.src);
    expect(image()?.alt).toBe(schifferstadt.alt);
    expect(credit()?.getAttribute("aria-hidden")).toBe("true");
    expect(credit()?.hasAttribute("inert")).toBe(true);
    await decode(image()!);
    expect(credit()?.getAttribute("aria-hidden")).toBeNull();
    expect(credit()?.hasAttribute("inert")).toBe(false);
    expect(credit()?.textContent).toContain(`Photo by ${schifferstadt.creator}.`);
    expect(credit()?.textContent).toContain(schifferstadt.modifications);
    expect(credit()?.querySelector(`a[href="${schifferstadt.source_url}"]`)?.textContent).toBe("Wikimedia Commons");
    expect(credit()?.querySelector(`a[href="${schifferstadt.license.url}"]`)?.textContent).toBe(schifferstadt.license.label);
    expect(request).not.toHaveBeenCalled();
    expectActions(place);
  });

  it.each(["error", "thin-signal"])("retains truthful facts and both actions after free photo %s", async (failure) => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const place = pick({ slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt" });
    await render(place);
    if (failure === "error") await act(async () => image()!.dispatchEvent(new Event("error")));
    else await decode(image()!, 1, 400);
    expect(image()).toBeNull();
    expect(container.querySelector("[data-place-card-photo]")).toBeNull();
    expect(container.querySelector("[data-today-place-preview]")?.getAttribute("data-has-photo")).toBe("false");
    expect(container.querySelector("[data-today-place-preview]")?.getAttribute("data-preview-layout")).toBe("exact");
    expect(container.querySelector("[data-today-place-thumb-fallback]")).not.toBeNull();
    expect(credit()).toBeNull();
    expect(container.textContent).toContain(place.name);
    expect(container.textContent).toContain("Hours not confirmed");
    expect(container.textContent).toContain("Brunswick · 6 min walk");
    expectActions(place);
    expect(request).not.toHaveBeenCalled();
  });

  it("retains decoded local Commons credit when only its unused Google candidate changes", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const place = pick({ slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt", photo: rawPhoto });
    await render(place, true);
    await decode(image()!);
    const decodedImage = image();
    await render({ ...place, photo: null }, true);
    expect(image()).toBe(decodedImage);
    expect(image()?.getAttribute("src")).toBe(schifferstadt.src);
    expect(credit()?.getAttribute("aria-hidden")).toBeNull();
    expect(credit()?.textContent).toContain(schifferstadt.creator);
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps already-attributed Google eligible without hydration while bytes wait for its frame", async () => {
    const request = vi.fn<(source: string, init?: RequestInit) => Promise<Response>>(async () => byteResponse());
    vi.stubGlobal("fetch", request);
    const place = pick({ photo: rawPhoto, photoAttribution: attribution });
    await render(place);
    expect(container.querySelector("[data-today-place-preview]")?.getAttribute("data-preview-layout")).toBe("compact");
    expect(container.querySelector("[data-today-place-thumb]")).not.toBeNull();
    expect(container.querySelector("[data-today-place-thumb-fallback]")).not.toBeNull();
    expect(container.querySelector("[data-place-card-photo]")?.getAttribute("data-place-card-photo-bytes")).toBe("idle");
    expect(container.querySelector("[data-photo-ready]")?.getAttribute("data-photo-ready")).toBe("false");
    expect(image()).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    await act(async () => enter[0]());
    expect(request).toHaveBeenCalledTimes(1);
    const [source, init] = request.mock.calls[0];
    const sourceUrl = new URL(source, "https://example.test");
    expect(sourceUrl.pathname).toBe("/api/place-photo");
    expect(sourceUrl.searchParams.get("name")).toBe(photoName);
    expect(sourceUrl.searchParams.get("w")).toBe("344");
    expect(sourceUrl.searchParams.get("fallback")).toBe("signal");
    expect(init).toEqual({ cache: "no-store", credentials: "same-origin", signal: expect.any(AbortSignal) });
    expect(image()?.getAttribute("src")).toBe("blob:today-preview-1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(credit()).toBeNull();
    await decode(image()!);
    expect(container.querySelector("[data-photo-ready]")?.getAttribute("data-photo-ready")).toBe("true");
    expect(container.querySelector("[data-today-place-preview]")?.getAttribute("data-has-photo")).toBe("true");
    expect(credit()?.getAttribute("aria-hidden")).toBeNull();
    expect(credit()?.textContent).toContain("Exact photo contributor");
    expect(credit()?.querySelector(`a[href="${googleSource}"]`)?.textContent).toBe("Google Maps");
    expect(container.querySelector("[data-today-place-thumb]")).not.toBeNull();
    expectActions(place);
  });

  it("re-decodes changed credit for the same Google source without fetching its settled bytes again", async () => {
    const request = vi.fn<(source: string, init?: RequestInit) => Promise<Response>>(async () => byteResponse());
    vi.stubGlobal("fetch", request);
    const place = pick({ photo: rawPhoto, photoAttribution: attribution });
    await render(place);
    await act(async () => enter[0]());
    const oldImage = image()!;
    const frame = container.querySelector("[data-place-card-photo]");
    const objectUrl = oldImage.getAttribute("src");
    await decode(oldImage);
    expect(credit()?.getAttribute("aria-hidden")).toBeNull();
    expect(credit()?.textContent).toContain("Exact photo contributor");
    expect(request).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);

    await render({ ...place, photoAttribution: {
      ...attribution, authors: [{ display_name: "Updated exact credit", uri: "https://www.google.com/maps/contrib/789" }],
    } });
    const nextImage = image()!;
    expect(container.querySelector("[data-place-card-photo]")).toBe(frame);
    expect(nextImage).not.toBe(oldImage);
    expect(nextImage.getAttribute("src")).toBe(objectUrl);
    expect(oldImage.isConnected).toBe(false);
    expect(credit()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    // Exercise real detached-image events. React no longer delivers these to
    // the mounted root; the A-to-B-to-A case separately invokes old callbacks.
    await decode(oldImage);
    await act(async () => oldImage.dispatchEvent(new Event("error")));
    expect(image()).toBe(nextImage);
    expect(credit()).toBeNull();
    await decode(nextImage);
    expect(credit()?.getAttribute("aria-hidden")).toBeNull();
    expect(credit()?.hasAttribute("inert")).toBe(false);
    expect(credit()?.textContent).toContain("Updated exact credit");
    expect(credit()?.textContent).not.toContain("Exact photo contributor");
    expect(request).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expectActions(place);
  });

  it("requires a fresh decode for a new selection even when its supplied image URL is unchanged", async () => {
    const request = vi.fn<(source: string, init?: RequestInit) => Promise<Response>>(async () => byteResponse());
    vi.stubGlobal("fetch", request);
    const first = pick({ photo: rawPhoto, photoAttribution: attribution });
    await render(first);
    await act(async () => enter[0]());
    const oldImage = image()!;
    await decode(oldImage);
    const next = { ...first, slug: "replacement-selection", name: "Replacement selection" };
    await render(next);
    expect(image()).not.toBe(oldImage);
    expect(image()?.getAttribute("src")).toBe(oldImage.getAttribute("src"));
    expect(credit()).toBeNull();
    await decode(oldImage);
    expect(credit()).toBeNull();
    await decode(image()!);
    expect(credit()?.getAttribute("aria-hidden")).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expectActions(next);
  });

  it("keeps the compact thumbnail slot after a Google fallback header", async () => {
    const request = vi.fn<(source: string, init?: RequestInit) => Promise<Response>>(async () => new Response(
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
      { headers: { "Content-Type": "image/png", "x-photo-fallback": "daily-cap" } },
    ));
    vi.stubGlobal("fetch", request);
    const place = pick({ photo: rawPhoto, photoAttribution: attribution });
    await render(place);
    const thumb = container.querySelector("[data-today-place-thumb]");
    expect(thumb).not.toBeNull();
    await act(async () => enter[0]());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(image()).toBeNull();
    expect(container.querySelector("[data-place-card-photo]")).toBeNull();
    expect(container.querySelector("[data-today-place-thumb]")).toBe(thumb);
    expect(container.querySelector("[data-today-place-thumb-fallback]")).not.toBeNull();
    expect(container.querySelector("[data-today-place-preview]")?.getAttribute("data-has-photo")).toBe("false");
    expect(container.querySelector("[data-today-place-preview]")?.getAttribute("data-preview-layout")).toBe("compact");
    expectActions(place);
  });

  it("keeps an uncredited Google candidate factual when metadata hydration is not allowed", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const place = pick({ photo: rawPhoto, confidence: "likely", fact: null });
    await render(place);
    expect(image()).toBeNull();
    expect(container.querySelector("[data-place-card-photo]")).toBeNull();
    expect(container.querySelector("[data-today-place-thumb]")).not.toBeNull();
    expect(container.querySelector("[data-today-place-thumb-fallback]")).not.toBeNull();
    expect(container.querySelector("[data-today-place-preview]")?.getAttribute("data-preview-layout")).toBe("compact");
    expect(container.textContent).toContain("Hours not confirmed");
    expect(container.textContent).not.toContain("Likely open");
    expect(container.textContent).not.toContain("check hours");
    expectActions(place);
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the failed free source exhausted when late exact credit adds a viewport-deferred fallback", async () => {
    let releaseCredit!: (response: Response) => void;
    const request = vi.fn<(source: string, init?: RequestInit) => Promise<Response>>()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseCredit = resolve; }))
      .mockImplementation(async () => byteResponse());
    vi.stubGlobal("fetch", request);
    const place = pick({ slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt", photo: rawPhoto });
    await render(place, true);
    const oldFree = photoHandlers.get(schifferstadt.src)!;
    expect(request).not.toHaveBeenCalled();
    await act(async () => image()!.dispatchEvent(new Event("error")));
    expect(image()).toBeNull();
    expect(request).toHaveBeenCalledExactlyOnceWith(`/api/places/map-card/${place.slug}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await act(async () => releaseCredit(new Response(JSON.stringify({ place: {
      slug: place.slug, google_photo_url: rawPhoto, google_photo_attribution: attribution,
    } }))));
    expect(container.querySelector("[data-place-card-photo]")?.getAttribute("data-place-card-photo-source")).toBe("google");
    expect(image()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => oldFree.onLoad?.({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as SyntheticEvent<HTMLImageElement>));
    expect(credit()?.getAttribute("aria-hidden")).toBe("true");
    await act(async () => enter.at(-1)!());
    expect(request).toHaveBeenCalledTimes(2);
    expect(image()?.getAttribute("src")).toBe("blob:today-preview-1");
    await decode(image()!);
    expect(credit()?.textContent).toContain("Exact photo contributor");
    expect(credit()?.textContent).not.toContain(schifferstadt.creator);
    await act(async () => image()!.dispatchEvent(new Event("error")));
    expect(image()).toBeNull();
    expect(credit()).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
    expectActions(place);
  });

  it("rejects old decode and error callbacks after the selection returns from A to B to A", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const first = pick({ slug: "schifferstadt-architectural-museum-frederick", name: "Schifferstadt" });
    await render(first);
    const oldFirst = photoHandlers.get(schifferstadt.src)!;
    await decode(image()!);
    await render(pick({ slug: "hessian-barracks-frederick-maryland", name: "Hessian Barracks" }));
    await render(first);
    expect(image()?.getAttribute("src")).toBe(schifferstadt.src);
    expect(credit()?.getAttribute("aria-hidden")).toBe("true");
    await act(async () => {
      oldFirst.onLoad?.({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as SyntheticEvent<HTMLImageElement>);
      oldFirst.onError?.({} as SyntheticEvent<HTMLImageElement>);
    });
    expect(image()?.getAttribute("src")).toBe(schifferstadt.src);
    expect(credit()?.getAttribute("aria-hidden")).toBe("true");
    await decode(image()!);
    expect(credit()?.getAttribute("aria-hidden")).toBeNull();
    expect(credit()?.textContent).toContain(schifferstadt.creator);
    expectActions(first);
    expect(request).not.toHaveBeenCalled();
  });
});
