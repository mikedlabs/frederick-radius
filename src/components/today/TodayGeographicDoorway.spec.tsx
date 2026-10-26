// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayGeographicDoorway, { TODAY_PIZZA_CATEGORY_PHOTO, TodayGeographicDoorwayPending, TodayGeographicDoorwayView, todayPizzaHref, todayShowsFrederickDoorway } from "./TodayGeographicDoorway";
import { setScope } from "@/lib/scope";
import { getOwnedPlacePhoto } from "@/lib/owned-place-photos";
import { getLandmarkPhoto } from "@/lib/integrations/wikimedia";

type ImageLoad = (event: { currentTarget: HTMLImageElement }) => void;
const callbacks = vi.hoisted(() => ({ loads: new Map<string, ImageLoad>() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/image", () => ({ default: ({ src, alt, onLoad, onError }: { src: string; alt: string; onLoad: ImageLoad; onError: () => void }) => {
  callbacks.loads.set(src, onLoad);
  return createElement("img", { src, alt, onLoad, onError });
} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const zoes = "zoes-chocolate-company", sabor = "sabor-de-cuba-restaurant-frederick";

describe("Today dining photo doorway", () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(() => {
    callbacks.loads.clear();
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    } });
    window.history.replaceState(null, "", "/today");
    setScope(null);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); setScope(null); });
  const render = async () => { await act(async () => root.render(createElement(TodayGeographicDoorway))); };
  const pizza = () => container.querySelector<HTMLAnchorElement>('[data-today-discovery-action="pizza"]')!;
  const imageAt = (tile: HTMLElement) => tile.querySelector("img")!;
  const decode = async (image: HTMLImageElement) => {
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1200 }, naturalHeight: { configurable: true, value: 800 } });
    await act(async () => image.dispatchEvent(new Event("load")));
  };

  it("keeps server and Suspense fallbacks inert and scope-neutral", () => {
    for (const Component of [TodayGeographicDoorwayPending, TodayGeographicDoorway]) {
      const html = renderToStaticMarkup(createElement(Component));
      expect(html).toContain('data-today-geographic-pending');
      expect(html).toContain('aria-hidden="true"');
      expect(html).not.toMatch(/<(?:a|img|h2|h3|button)\b/);
      expect(html).not.toMatch(/Frederick|Zoe|Sabor|pizza|\/places\/|\/images\//i);
    }
  });

  it("uses the accepted owner image only as an unlocated category illustration", async () => {
    await render();
    expect(imageAt(pizza()).getAttribute("src")).toBe(TODAY_PIZZA_CATEGORY_PHOTO.src);
    expect(imageAt(pizza()).getAttribute("alt")).toBe("Rectangular pizzas with cheese and herbs on a preparation counter.");
    expect(pizza().getAttribute("aria-label")).toBe("Find pizza");
    expect(pizza().textContent).toBe("Find pizza");
    expect(pizza().hasAttribute("data-today-geographic-place")).toBe(false);
    expect(pizza().querySelectorAll("a, button, input, select")).toHaveLength(0);
    expect(pizza().getAttribute("data-photo-state")).toBe("pending");
  });

  it("holds undated/archival storefronts even in the correct town and retains the category return", async () => {
    window.history.replaceState(null, "", "/today?in=county&intent=coffee#find-radius");
    await render();
    expect(getOwnedPlacePhoto(zoes)).not.toBeNull();
    expect(getLandmarkPhoto(sabor)?.alt).toContain("2018");
    expect(container.querySelectorAll("[data-today-discovery-action]")).toHaveLength(1);
    expect(container.querySelector("[data-today-geographic-place], [data-today-discovery-credit], .place-card-photo-credit")).toBeNull();
    expect(container.querySelector("[data-today-discovery-grid]")?.hasAttribute("data-local-businesses")).toBe(false);
    expect(container.querySelectorAll("[data-place-card-photo]")).toHaveLength(1);
    const url = new URL(pizza().href);
    expect(url.searchParams.get("in")).toBe("county");
    expect(url.searchParams.get("returnTo")).toBe("/today?in=county&intent=coffee#find-radius");
    expect(container.textContent).not.toMatch(/Zoe|Sabor/);
  });

  it("allows these named businesses only for county and Frederick lenses", () => {
    for (const scope of [null, "county", "town:frederick"] as const) expect(todayShowsFrederickDoorway(scope)).toBe(true);
    for (const scope of ["nearme", "town:brunswick", "town:thurmont", "town:mount-airy"] as const) expect(todayShowsFrederickDoorway(scope)).toBe(false);
  });

  it.each(["town:brunswick", "town:thurmont", "town:mount-airy", "nearme"] as const)("keeps generic pizza within %s without foreign businesses or location prompts", async scope => {
    const request = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: request, watchPosition: request } });
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope })));
    expect(container.querySelectorAll("[data-today-discovery-action]")).toHaveLength(1);
    expect(container.querySelector("[data-today-geographic-place], .place-card-photo-credit")).toBeNull();
    expect(container.textContent).toBe("Find pizza");
    const url = new URL(pizza().href);
    expect(url.pathname).toBe("/nearby"); expect(url.searchParams.get("c")).toBe("food"); expect(url.searchParams.get("facet")).toBe("pizza");
    expect(url.searchParams.get("in")).toBe(scope === "nearme" ? scope : scope.slice(5));
    expect(request).not.toHaveBeenCalled();
  });

  it("lets validated URL scope win over saved scope and preserves intent/hash on both routes", async () => {
    setScope("town:frederick"); window.history.replaceState(null, "", "/today?in=brunswick&intent=coffee#find-radius"); await render();
    expect(container.querySelector("[data-today-geographic-place]")).toBeNull();
    const url = new URL(pizza().href);
    expect(url.searchParams.get("in")).toBe("brunswick");
    expect(url.searchParams.get("returnTo")).toBe("/today?in=brunswick&intent=coffee#find-radius");
    expect(window.location.search).toBe("?in=brunswick&intent=coffee"); expect(window.location.hash).toBe("#find-radius");
  });

  it.each(["", "unknown-town"])("treats present invalid scope %s as county rather than restoring a saved town", async raw => {
    setScope("town:brunswick");
    window.history.replaceState(null, "", `/today?in=${raw}&intent=coffee#find-radius`);
    await render();
    expect(new URL(pizza().href).searchParams.get("in")).toBe("county");
    expect(new URL(pizza().href).searchParams.get("returnTo")).toBe("/today?in=county&intent=coffee#find-radius");
    expect(container.querySelector("[data-today-geographic-place]")).toBeNull();
    expect(window.location.search).toBe(`?in=${raw}&intent=coffee`);
    expect(window.location.hash).toBe("#find-radius");
  });

  it("tracks saved scope and actual hash changes without resetting the browsing lens", async () => {
    await render();
    await act(async () => setScope("town:thurmont"));
    expect(container.querySelector("[data-today-geographic-place]")).toBeNull();
    expect(new URL(pizza().href).searchParams.get("in")).toBe("thurmont");
    await act(async () => { window.history.replaceState(null, "", "/today#find-radius"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(new URL(pizza().href).searchParams.get("returnTo")).toBe("/today?in=thurmont#find-radius");
    await act(async () => setScope("county"));
    expect(container.querySelectorAll("[data-today-geographic-place]")).toHaveLength(0);
    expect(new URL(pizza().href).searchParams.get("in")).toBe("county");
  });

  it("never revives a failed category photo or substitutes an unverified merchant", async () => {
    await render();
    const old = imageAt(pizza()), lateLoad = callbacks.loads.get(TODAY_PIZZA_CATEGORY_PHOTO.src)!;
    await act(async () => old.dispatchEvent(new Event("error")));
    Object.defineProperties(old, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
    await act(async () => lateLoad({ currentTarget: old }));
    expect(pizza().querySelector("img")).toBeNull(); expect(pizza().getAttribute("data-photo-state")).toBe("failed");
    expect(pizza().textContent).toBe("Find pizza");
    expect(container.querySelector("[data-today-geographic-place], .place-card-photo-credit")).toBeNull();
  });

  it("settles the exact category photo without enabling a named business", async () => {
    await render(); await decode(imageAt(pizza()));
    expect(pizza().getAttribute("data-photo-state")).toBe("loaded");
    expect(container.querySelectorAll("[data-today-discovery-action]")).toHaveLength(1);
    expect(container.querySelector("[data-today-geographic-place]")).toBeNull();
  });

  it("retains the category action without any photo and makes no availability claim", async () => {
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope: "county", categoryPhoto: null })));
    expect(pizza().querySelector("img")).toBeNull(); expect(pizza().textContent).toBe("Find pizza");
    expect(container.textContent).not.toMatch(/open now|available now|recommended|best|made in Frederick|hours confirmed/i);
    expect(container.querySelector('[role="combobox"], input, form')).toBeNull();
    expect(container.querySelectorAll('[aria-label="Find pizza"]')).toHaveLength(1);
  });

  it("drops unsafe external return origins rather than leaking them to navigation", () => {
    const url = new URL(todayPizzaHref("county", "https://evil.example/today"), "https://radius.example");
    expect(url.searchParams.has("returnTo")).toBe(false); expect(url.pathname).toBe("/nearby");
  });
});
