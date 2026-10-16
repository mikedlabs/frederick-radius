// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayGeographicDoorway, { TodayGeographicDoorwayPending, TodayGeographicDoorwayView, todayShowsFrederickDoorway } from "./TodayGeographicDoorway";
import { setScope } from "@/lib/scope";

type ImageLoad = (event: { currentTarget: HTMLImageElement }) => void;
const imageCallbacks = vi.hoisted(() => ({ onLoad: null as ImageLoad | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/image", () => ({
  default: ({ src, alt, onLoad, onError }: { src: string | Blob; alt: string; onLoad: ImageLoad; onError: () => void }) => {
    imageCallbacks.onLoad = onLoad;
    return createElement("img", { src: typeof src === "string" ? src : undefined, alt, onLoad, onError });
  },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Today exact geographic doorway", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    imageCallbacks.onLoad = null;
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

  it("renders an inert scope-neutral initial fallback instead of an actionable Frederick scene", () => {
    const html = renderToStaticMarkup(createElement(TodayGeographicDoorwayPending));
    expect(html).toContain('data-today-geographic-pending');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<(?:a|img|h2|button)\b/);
    expect(html).not.toMatch(/Frederick|Carroll|Creek|\/places\/|\/images\//);
  });

  it("allows only county/no-town or the actual Frederick lens", () => {
    for (const scope of [null, "county", "town:frederick"] as const) expect(todayShowsFrederickDoorway(scope)).toBe(true);
    for (const scope of ["nearme", "town:brunswick", "town:thurmont", "town:mount-airy"] as const) expect(todayShowsFrederickDoorway(scope)).toBe(false);
  });

  it("shows the owned exact image and canonical place action without an availability recommendation", async () => {
    await render();
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/places/carroll-creek-linear-park-frederick");
    expect(link.getAttribute("aria-label")).toBe("View Carroll Creek Linear Park in Frederick");
    expect(link.querySelector("img")?.getAttribute("src")).toBe("/images/seasons/summer/SUMMER CARROL CREEK.jpg");
    expect(link.textContent).toContain("Carroll CreekFrederickView place");
    expect(link.querySelectorAll("a, button, input, select")).toHaveLength(0);
    const figure = link.querySelector("figure")!;
    const caption = link.querySelector("[data-today-geographic-caption]")!;
    expect(figure.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.querySelectorAll("[data-today-geographic-caption]")).toHaveLength(1);
    expect(link.textContent).not.toMatch(/open|safe|best|today|Mike|2023/i);
    expect(link.getAttribute("data-photo-state")).toBe("pending");
    const image = link.querySelector("img")!;
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1920 }, naturalHeight: { configurable: true, value: 1078 } });
    await act(async () => image.dispatchEvent(new Event("load")));
    expect(link.getAttribute("data-photo-state")).toBe("loaded");
    expect(link.querySelector("h2")?.textContent).toBe("Carroll Creek");
  });

  it("does not resurrect failed media when a detached image finishes decoding late", async () => {
    await render();
    const oldImage = container.querySelector("img")!;
    const lateLoad = imageCallbacks.onLoad!;
    await act(async () => oldImage.dispatchEvent(new Event("error")));
    Object.defineProperties(oldImage, { naturalWidth: { value: 1920 }, naturalHeight: { value: 1078 } });
    await act(async () => lateLoad({ currentTarget: oldImage }));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("data-photo-state")).toBe("failed");
    expect(container.textContent).toContain("Carroll CreekFrederickView place");
  });

  it.each(["error", "pixel"])("retains its true named place action when media fails as %s", async (failure) => {
    await render();
    const image = container.querySelector("img")!;
    if (failure === "pixel") Object.defineProperties(image, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    await act(async () => image.dispatchEvent(new Event(failure === "pixel" ? "load" : "error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/places/carroll-creek-linear-park-frederick");
    expect(container.textContent).toContain("Carroll CreekFrederickView place");
    expect(container.querySelector("a")?.getAttribute("data-photo-state")).toBe("failed");
  });

  it("uses an explicit Brunswick URL over saved Frederick and never requests location", async () => {
    setScope("town:frederick");
    window.history.replaceState(null, "", "/today?in=brunswick&intent=coffee#find-radius");
    const locationRequest = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: locationRequest } });
    await render();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(locationRequest).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?in=brunswick&intent=coffee");
    expect(window.location.hash).toBe("#find-radius");
  });

  it("tracks saved scope changes and a later canonical county URL without changing its image identity", async () => {
    await render();
    await act(async () => setScope("town:thurmont"));
    expect(container.querySelector("a")).toBeNull();
    window.history.replaceState(null, "", "/today?in=county");
    await render();
    expect(container.querySelector("a")?.textContent).toContain("Carroll Creek");
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Carroll Creek in Frederick.");
  });

  it("suppresses the actual view when the town changes, without relabeling its geographic photograph", async () => {
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope: "town:frederick" })));
    expect(container.textContent).toContain("Frederick");
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope: "town:brunswick" })));
    expect(container.textContent).toBe("");
    expect(container.querySelector("img")).toBeNull();
  });
});
