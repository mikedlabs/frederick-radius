// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayGeographicDoorway, { TodayGeographicDoorwayPending, TodayGeographicDoorwayView, todayShowsFrederickDoorway } from "./TodayGeographicDoorway";
import { setScope } from "@/lib/scope";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";

type ImageLoad = (event: { currentTarget: HTMLImageElement }) => void;
const imageCallbacks = vi.hoisted(() => ({ onLoads: new Map<string, ImageLoad>() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/image", () => ({
  default: ({ src, alt, loading, onLoad, onError }: { src: string | Blob; alt: string; loading: "eager"; onLoad: ImageLoad; onError: () => void }) => {
    if (typeof src === "string") imageCallbacks.onLoads.set(src, onLoad);
    return createElement("img", { src: typeof src === "string" ? src : undefined, alt, loading, onLoad, onError });
  },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const places = [
  { slug: "carroll-creek-linear-park-frederick", action: "Carroll Creek Linear Park", title: "Carroll Creek", src: "/images/places/carroll-creek-aerial.jpg" },
  { slug: "baker-park-frederick", action: "Baker Park", title: "Baker Park", src: "/images/places/baker-park-detail.jpg" },
  { slug: "visitation-hotel", action: "Visitation Hotel", title: "Visitation Hotel", src: "/images/places/visitation-hotel-detail.jpg" },
] as const;

describe("Today exact geographic doorway", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    imageCallbacks.onLoads.clear();
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    } });
    window.history.replaceState(null, "", "/today");
    setScope(null);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setScope(null);
  });
  const render = async () => { await act(async () => root.render(createElement(TodayGeographicDoorway))); };
  const anchor = (slug = places[0].slug as string) => container.querySelector<HTMLAnchorElement>(`[data-today-geographic-place="${slug}"]`)!;
  const decode = async (image: HTMLImageElement) => {
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1280 }, naturalHeight: { configurable: true, value: 720 } });
    await act(async () => image.dispatchEvent(new Event("load")));
  };

  it("keeps the server fallback inert and scope-neutral instead of showing a Frederick scene", () => {
    const html = renderToStaticMarkup(createElement(TodayGeographicDoorwayPending));
    expect(html).toContain('data-today-geographic-pending');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<(?:a|img|h2|h3|button)\b/);
    expect(html).not.toMatch(/Frederick|Carroll|Creek|Baker|Visitation|\/places\/|\/images\//);
  });

  it("allows only county/no-town or the actual Frederick lens", () => {
    for (const scope of [null, "county", "town:frederick"] as const) expect(todayShowsFrederickDoorway(scope)).toBe(true);
    for (const scope of ["nearme", "town:brunswick", "town:thurmont", "town:mount-airy"] as const) expect(todayShowsFrederickDoorway(scope)).toBe(false);
  });

  it("shows three distinct exact owned subjects as independent canonical place actions", async () => {
    await render();
    expect(container.querySelectorAll("a")).toHaveLength(3);
    expect(container.querySelectorAll("img")).toHaveLength(3);
    for (const place of places) {
      const link = anchor(place.slug), image = link.querySelector("img")!;
      expect(link.getAttribute("href")).toBe(`/places/${place.slug}`);
      expect(link.getAttribute("aria-label")).toBe(`View ${place.action} in Frederick`);
      expect(image.getAttribute("src")).toBe(place.src);
      expect(image.getAttribute("alt")).toBe(getOwnedPlacePhoto(place.slug)?.alt);
      expect(image.getAttribute("loading")).toBe("eager");
      expect(link.querySelectorAll("a, button, input, select")).toHaveLength(0);
      expect(link.querySelector("h2, h3")?.textContent).toBe(place.title);
      expect(link.getAttribute("data-photo-state")).toBe("pending");
      expect(link.querySelector("figure")!.compareDocumentPosition(link.querySelector("[data-today-geographic-caption]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(container.querySelectorAll("[data-today-photo-lead]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-today-geographic-doorway]")).toHaveLength(1);
    expect(container.textContent).toBe("Carroll CreekFrederickBaker ParkVisitation Hotel");
    expect(container.textContent).not.toMatch(/open|safe|best|today|Mike|2023|View place/i);
  });

  it("paints a healthy supporting photograph while the main image and other tile are still pending", async () => {
    await render();
    await decode(anchor(places[1].slug).querySelector("img")!);
    expect(anchor(places[1].slug).getAttribute("data-photo-state")).toBe("loaded");
    expect(anchor().getAttribute("data-photo-state")).toBe("pending");
    expect(anchor(places[2].slug).getAttribute("data-photo-state")).toBe("pending");
  });

  it("does not resurrect failed main media when a detached image decodes late", async () => {
    await render();
    const oldImage = anchor().querySelector("img")!;
    const lateLoad = imageCallbacks.onLoads.get(places[0].src)!;
    await act(async () => oldImage.dispatchEvent(new Event("error")));
    Object.defineProperties(oldImage, { naturalWidth: { value: 1280 }, naturalHeight: { value: 720 } });
    await act(async () => lateLoad({ currentTarget: oldImage }));
    expect(anchor().querySelector("img")).toBeNull();
    expect(anchor().getAttribute("data-photo-state")).toBe("failed");
    expect(anchor().textContent).toBe("Carroll CreekFrederick");
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it.each(["error", "pixel"])("retains each named action and healthy neighbors when one photo fails as %s", async (failure) => {
    await render();
    await decode(anchor().querySelector("img")!);
    const link = anchor(places[2].slug), image = link.querySelector("img")!;
    if (failure === "pixel") Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    await act(async () => image.dispatchEvent(new Event(failure === "pixel" ? "load" : "error")));
    expect(link.querySelector("img, figure")).toBeNull();
    expect(link.getAttribute("href")).toBe("/places/visitation-hotel");
    expect(link.textContent).toBe("Visitation Hotel");
    expect(link.getAttribute("data-photo-state")).toBe("failed");
    expect(anchor().getAttribute("data-photo-state")).toBe("loaded");
    expect(container.querySelectorAll("a")).toHaveLength(3);
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("uses an explicit Brunswick URL over saved Frederick and never requests location", async () => {
    setScope("town:frederick");
    window.history.replaceState(null, "", "/today?in=brunswick&intent=coffee#find-radius");
    const locationRequest = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: locationRequest } });
    await render();
    expect(container.querySelector("a, img")).toBeNull();
    expect(locationRequest).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?in=brunswick&intent=coffee");
    expect(window.location.hash).toBe("#find-radius");
  });

  it("tracks saved scope changes and restores the actual county mosaic without relabeling its photos", async () => {
    await render();
    await act(async () => setScope("town:thurmont"));
    expect(container.querySelector("a, img")).toBeNull();
    window.history.replaceState(null, "", "/today?in=county");
    await render();
    expect(container.querySelectorAll("a")).toHaveLength(3);
    for (const place of places) expect(anchor(place.slug).querySelector("img")?.getAttribute("alt")).toBe(getOwnedPlacePhoto(place.slug)?.alt);
  });

  it("suppresses the whole actual view when the town changes", async () => {
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope: "town:frederick" })));
    expect(container.querySelectorAll("img")).toHaveLength(3);
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope: "town:brunswick" })));
    expect(container.textContent).toBe("");
    expect(container.querySelector("a, img")).toBeNull();
  });
});
