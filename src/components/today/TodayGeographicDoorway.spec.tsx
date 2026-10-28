// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayGeographicDoorway, { TodayGeographicDoorwayPending, TodayGeographicDoorwayView, todayDiscoveryTaskHref } from "./TodayGeographicDoorway";
import { setScope, type Scope } from "@/lib/scope";
import { localDiscoveryPlaces } from "@/lib/today/discovery-places";
import * as photos from "@/lib/place-card-photo";

type ImageLoad = (event: { currentTarget: HTMLImageElement }) => void;
const callbacks = vi.hoisted(() => ({ loads: new Map<string, ImageLoad>() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/image", () => ({ default: ({ src, alt, onLoad, onError }: { src: string; alt: string; onLoad: ImageLoad; onError: () => void }) => {
  callbacks.loads.set(src, onLoad);
  return createElement("img", { src, alt, onLoad, onError });
} }));
vi.mock("@/components/saved/SaveButton", () => ({ default: ({ refId, label, barLabel, importLocalSavesOnMount }: {
  refId: string; label: string; barLabel?: string; importLocalSavesOnMount?: boolean;
}) => <button type="button" data-save-ref={`place:${refId}`} aria-label={label}
  data-import-local-saves={String(importLocalSavesOnMount)}>{barLabel}</button> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const carillon = "joseph-dill-baker-memorial-carillon-bell-tower";
const sophie = "sophie-madigans-playground-frederick";
const countyOrigin = "/today?in=county&intent=coffee#find-radius";

describe("Today local discovery", () => {
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
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); setScope(null); vi.restoreAllMocks(); });
  const render = async () => { await act(async () => root.render(createElement(TodayGeographicDoorway))); };
  const tasks = () => Array.from(container.querySelectorAll<HTMLAnchorElement>('[data-today-discovery-action="food"], [data-today-discovery-action="outside"]'));
  const places = () => Array.from(container.querySelectorAll<HTMLAnchorElement>("[data-today-geographic-place]"));
  const decode = async (image: HTMLImageElement) => {
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1200 }, naturalHeight: { configurable: true, value: 800 } });
    await act(async () => image.dispatchEvent(new Event("load")));
  };

  it("keeps server and Suspense fallbacks inert and scope-neutral", () => {
    for (const Component of [TodayGeographicDoorwayPending, TodayGeographicDoorway]) {
      const html = renderToStaticMarkup(createElement(Component));
      expect(html).toContain('data-today-geographic-pending'); expect(html).toContain('aria-hidden="true"');
      expect(html).not.toMatch(/<(?:a|img|h2|h3|button)\b/);
      expect(html).not.toMatch(/Frederick|Zoe|Sabor|pizza|\/places\/|\/images\//i);
    }
  });

  it("replaces pizza advertising with two exact owned local views and two broad tasks", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await render();
    expect(places().map(link => link.dataset.todayGeographicPlace)).toEqual([carillon, sophie]);
    expect(places().map(link => link.querySelector("h3")!.textContent)).toEqual(["Baker Park Carillon", "Sophie & Madigan's Playground"]);
    expect(places()[0].getAttribute("aria-label")).toBe("View Joseph Dill Baker Memorial Carillon Bell Tower in Frederick City");
    expect(places()[1].getAttribute("aria-label")).toBe("View Sophie & Madigan's Playground in Frederick City");
    expect(places().every(link => link.textContent!.endsWith("Frederick City"))).toBe(true);
    expect(container.querySelectorAll('[data-place-card-photo-source="owned"]')).toHaveLength(2);
    expect(container.querySelectorAll("[data-today-photo-lead]")).toHaveLength(1);
    expect(Array.from(container.querySelectorAll("[data-today-discovery-role]")).map(card => card.getAttribute("data-today-discovery-role"))).toEqual(["lead", "secondary"]);
    const saves = Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-save-ref]"));
    expect(saves.map(button => button.getAttribute("data-save-ref"))).toEqual([`place:${carillon}`, `place:${sophie}`]);
    expect(saves.every(button => button.getAttribute("data-import-local-saves") === "false" && !button.closest("a"))).toBe(true);
    expect(tasks().map(link => link.textContent)).toEqual(["Eat & drink", "Get outside"]);
    expect(container.textContent).not.toMatch(/pizza|Zoe|Sabor|open now|recommended|available now/i);
    expect(container.querySelector("[data-today-discovery-credit], .place-card-photo-credit, input, select, form")).toBeNull();
    for (const link of [...places(), ...tasks()]) expect(link.querySelector("a, button, input, select")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["county", "town:frederick"] as const)("keeps exact local names, source bytes, scope and origin within %s", async scope => {
    const origin = `/today?in=${scope === "county" ? "county" : "frederick"}&intent=coffee#find-radius`;
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope, returnTo: origin })));
    for (const [index, place] of localDiscoveryPlaces(scope).entries()) {
      const link = places()[index], image = link.querySelector("img")!;
      expect(image.getAttribute("src")).toBe(place.photoPlan.sources[0].src);
      expect(image.getAttribute("alt")).toBe(place.photoPlan.sources[0].alt);
      expect(link.dataset.photoState).toBe("pending"); await decode(image); expect(link.dataset.photoState).toBe("loaded");
      const url = new URL(link.href); expect(url.pathname).toBe(`/places/${place.slug}`);
      expect(url.searchParams.get("in")).toBe(scope === "county" ? "county" : "frederick");
      expect(url.searchParams.get("returnTo")).toBe(origin);
    }
  });

  it.each(["town:thurmont", "town:brunswick", "town:walkersville", "town:new-market", "town:emmitsburg", "town:middletown"] as const)("uses only exact accepted %s place identities and retains external credits", async scope => {
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope })));
    const selected = localDiscoveryPlaces(scope);
    expect(places().map(link => link.dataset.todayGeographicPlace)).toEqual(selected.map(place => place.slug));
    expect(selected.length).toBeGreaterThan(0);
    expect(places().some(link => [carillon, sophie].includes(link.dataset.todayGeographicPlace!))).toBe(false);
    for (const [index, place] of selected.entries()) {
      const link = places()[index]; await decode(link.querySelector("img")!);
      expect(link.getAttribute("aria-label")).toBe(`View ${place.name} in ${place.town}`);
      expect(new URL(link.href).searchParams.get("in")).toBe(scope.slice(5));
      expect(link.querySelector(".place-card-photo-credit")).toBeNull();
      const credit = container.querySelector(`[data-today-discovery-credit="${place.slug}"] .place-card-photo-credit`);
      expect(credit).not.toBeNull(); expect(credit!.getAttribute("aria-hidden")).toBeNull();
      expect(credit!.querySelectorAll("a").length).toBeGreaterThanOrEqual(2);
      expect(credit!.closest("[data-today-geographic-place]")).toBeNull();
    }
  });

  it.each(["town:mount-airy", "town:myersville", "town:woodsboro", "town:rosemont", "town:urbana", "town:burkittsville", "nearme"] as const)("keeps useful tasks without an empty photo slot or a foreign place in %s", async scope => {
    const request = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: request, watchPosition: request } });
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope })));
    expect(places()).toHaveLength(0); expect(container.querySelector("[data-today-discovery-grid], img, .place-card-photo-credit")).toBeNull();
    expect(tasks()).toHaveLength(2);
    for (const link of tasks()) {
      const url = new URL(link.href); expect(url.pathname).toBe("/nearby");
      expect(url.searchParams.get("c")).toBe(link.dataset.todayDiscoveryAction);
      expect(url.searchParams.get("in")).toBe(scope === "nearme" ? "nearme" : scope.slice(5));
      expect(url.searchParams.has("facet")).toBe(false);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("lets a validated URL town win over saved scope and preserves intent and hash on every destination", async () => {
    setScope("town:frederick"); window.history.replaceState(null, "", "/today?in=brunswick&intent=coffee#find-radius"); await render();
    expect(places()).toHaveLength(1); expect(places()[0].dataset.todayGeographicPlace).toBe("co-canal-lock-30-brunswick");
    for (const link of [...places(), ...tasks()]) {
      const url = new URL(link.href); expect(url.searchParams.get("in")).toBe("brunswick");
      expect(url.searchParams.get("returnTo")).toBe("/today?in=brunswick&intent=coffee#find-radius");
    }
    expect(window.location.search).toBe("?in=brunswick&intent=coffee"); expect(window.location.hash).toBe("#find-radius");
  });

  it.each(["", "unknown-town"])("treats present invalid scope %s as county instead of restoring a saved town", async raw => {
    setScope("town:brunswick"); window.history.replaceState(null, "", `/today?in=${raw}&intent=coffee#find-radius`); await render();
    expect(places().map(link => link.dataset.todayGeographicPlace)).toEqual([carillon, sophie]);
    for (const link of [...places(), ...tasks()]) {
      expect(new URL(link.href).searchParams.get("in")).toBe("county");
      expect(new URL(link.href).searchParams.get("returnTo")).toBe(countyOrigin);
    }
    expect(window.location.search).toBe(`?in=${raw}&intent=coffee`);
  });

  it("tracks saved scope, hash and Back changes without overwriting the browsing URL", async () => {
    await render(); await act(async () => setScope("town:thurmont"));
    expect(places().every(link => new URL(link.href).searchParams.get("in") === "thurmont")).toBe(true);
    await act(async () => { window.history.replaceState(null, "", "/today#find-radius"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(new URL(tasks()[0].href).searchParams.get("returnTo")).toBe("/today?in=thurmont#find-radius");
    await act(async () => { window.history.replaceState(null, "", "/today?in=mount-airy&intent=outside#find-radius"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(places()).toHaveLength(0);
    expect(new URL(tasks()[0].href).searchParams.get("returnTo")).toBe("/today?in=mount-airy&intent=outside#find-radius");
    expect(window.location.search).toBe("?in=mount-airy&intent=outside");
  });

  it("keeps the exact destination and both tasks when an image fails, without reviving a late load", async () => {
    await render(); const link = places()[0], image = link.querySelector("img")!, src = image.getAttribute("src")!;
    const lateLoad = callbacks.loads.get(src)!;
    const href = link.getAttribute("href");
    await act(async () => image.dispatchEvent(new Event("error")));
    Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
    await act(async () => lateLoad({ currentTarget: image }));
    expect(link.querySelector("img")).toBeNull(); expect(link.dataset.photoState).toBe("failed");
    expect(link.querySelector("h3")!.textContent).toBe("Baker Park Carillon"); expect(link.textContent).toContain("Frederick");
    expect(link.getAttribute("href")).toBe(href); expect(tasks()).toHaveLength(2);
    expect(places()[1].querySelector("img")).not.toBeNull();
    await act(async () => { window.history.replaceState(null, "", "/today#find-radius"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(places()[0].dataset.photoState).toBe("failed"); expect(places()[0].querySelector("img")).toBeNull();
  });

  it("ignores a disconnected old town's image result after scope changes", async () => {
    await render(); const old = places()[0].querySelector("img")!, lateLoad = callbacks.loads.get(old.getAttribute("src")!)!;
    await act(async () => setScope("town:brunswick"));
    Object.defineProperties(old, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
    await act(async () => lateLoad({ currentTarget: old }));
    expect(places()).toHaveLength(1); expect(places()[0].dataset.todayGeographicPlace).toBe("co-canal-lock-30-brunswick");
    expect(container.textContent).not.toMatch(/Carillon|Sophie/); expect(places()[0].dataset.photoState).toBe("pending");
  });

  it("retains tasks without an empty grid when an accepted image plan is withdrawn", async () => {
    vi.spyOn(photos, "placeCardPhotoPlan").mockReturnValue({ key: "withdrawn", sources: [] });
    await render(); expect(places()).toHaveLength(0); expect(container.querySelector("[data-today-discovery-grid], img")).toBeNull(); expect(tasks()).toHaveLength(2);
  });

  it("drops an unsafe external return origin from both task destinations", () => {
    for (const task of ["food", "outside"] as const) {
      const url = new URL(todayDiscoveryTaskHref(task, "county", "https://evil.example/today"), "https://radius.example");
      expect(url.searchParams.has("returnTo")).toBe(false); expect(url.pathname).toBe("/nearby");
    }
  });

  it.each(["county", "town:brunswick", "town:mount-airy", "nearme"] as Scope[])("does not fetch metadata, providers or live facts while rendering %s", async scope => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await act(async () => root.render(createElement(TodayGeographicDoorwayView, { scope })));
    for (const image of Array.from(container.querySelectorAll("img"))) await decode(image);
    expect(fetch).not.toHaveBeenCalled(); expect(container.innerHTML).not.toContain("/api/place-photo");
    expect(container.textContent).not.toMatch(/current weather|open now|hours confirmed|recommended|available now/i);
  });
});
