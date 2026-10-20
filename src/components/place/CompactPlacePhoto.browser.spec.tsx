// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Deliberate native image seam drives real load/failure events without provider requests. */
import { act, type ComponentProps } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const imageEvents = vi.hoisted(() => new Map<string, ComponentProps<"img">["onLoad"]>());
vi.mock("next/image", () => ({ default: ({ src, alt, onLoad, onError, ref, sizes, style }: ComponentProps<"img">) => {
  imageEvents.set(String(src), onLoad);
  return <img ref={ref} src={src} alt={alt ?? ""} sizes={sizes} style={style} onLoad={onLoad} onError={onError} />;
} }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
import CompactPlacePhoto from "./CompactPlacePhoto";
import { PlaceMedallion } from "./PlaceMedallion";
import MapList from "@/components/map/MapList";
import { mapListPhotoLoader } from "@/components/map/map-list-photo-loader";
import type { MapPinPlace } from "@/components/map/types";
import { CREDITED_LOCAL_PLACE_PHOTOS } from "@/data/credited-local-place-photos";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const owned = "/images/seasons/summer/SUMMER CARROL CREEK.jpg";
const row = (slug: string): MapPinPlace => ({ slug, name: slug === "new-market-historic-district-new-market" ? "New Market Historic District" : "Carroll Creek Linear Park",
  category: "park", subcategories: [], geom: { lat: 39.4, lng: -77.4 }, municipality: "frederick", source: "manual", is_verified: true, short_blurb: "",
  open_status: { state: "unknown" } });
const google = { google_photo_url: "/api/place-photo?name=places%2Factual-place%2Fphotos%2Fhero&w=800",
  google_photo_attribution: { photo_name: "places/actual-place/photos/hero", authors: [{ display_name: "Actual photographer" }],
    google_maps_uri: "https://www.google.com/maps/photos/actual-place" } };

describe("compact place photo continuity", () => {
  let host: HTMLDivElement;
  let root: Root | undefined;
  beforeEach(() => {
    imageEvents.clear();
    host = document.createElement("div"); document.body.append(host);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("This image test must not fetch a provider"); }));
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  });
  afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const render = async (element: React.ReactNode) => act(async () => { root ??= createRoot(host); root.render(element); });
  const image = () => host.querySelector<HTMLImageElement>("img")!;
  async function load(target = image(), width = 600, height = 400) {
    Object.defineProperties(target, { naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height } });
    await act(async () => target.dispatchEvent(new Event("load")));
  }
  const fail = async (target = image()) => act(async () => target.dispatchEvent(new Event("error")));

  it("prefers an exact owned medallion, exhausts failed sources and never revives a late old load", async () => {
    await render(<PlaceMedallion place={{ slug: "carroll-creek-linear-park-frederick", name: "Carroll Creek", category: "park", ...google }} />);
    expect(image().src).toContain(encodeURI(owned));
    const lateOwnedLoad = imageEvents.get(owned)!;
    await fail();
    expect(image().getAttribute("src")).toContain("w=80");
    expect(image().getAttribute("src")).toContain("fallback=signal");
    await load(image(), 1, 1);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-place-media]")?.getAttribute("data-place-media")).toBe("fallback");
    await act(async () => lateOwnedLoad({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as never));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("svg")).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reconciles a completed failure before hydration and lets a genuinely changed source load", async () => {
    const result = vi.fn();
    const element = <CompactPlacePhoto src={owned} size={32} onResult={result} />;
    host.innerHTML = renderToString(element);
    Object.defineProperties(image(), { complete: { value: true }, naturalWidth: { value: 0 }, naturalHeight: { value: 0 } });
    await act(async () => { root = hydrateRoot(host, element); });
    expect(host.querySelector("img")).toBeNull();
    expect(result).toHaveBeenCalledExactlyOnceWith(owned, "failed");
    await render(<CompactPlacePhoto src="/images/changed.jpg" size={32} onResult={result} />);
    await load();
    expect(result).toHaveBeenLastCalledWith("/images/changed.jpg", "loaded");
  });

  it("renders a Map row's already-owned photo with no metadata trip and preserves its action", async () => {
    const metadata = vi.spyOn(mapListPhotoLoader, "loadData");
    const onPick = vi.fn();
    const place = row("carroll-creek-linear-park-frederick");
    await render(<MapList places={[place]} events={[]} userLoc={null} onPick={onPick} onPickEvent={() => {}} />);
    expect(image().getAttribute("src")).toBe(owned);
    expect(host.querySelector("[data-photo-state]")?.getAttribute("data-photo-state")).toBe("pending");
    await load();
    expect(host.querySelector("[data-photo-state]")?.getAttribute("data-photo-state")).toBe("ready");
    await act(async () => host.querySelector<HTMLButtonElement>("[data-map-place-slug]")!.click());
    expect(onPick).toHaveBeenCalledExactlyOnceWith(place);
    expect(metadata).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps a licensed local Map photo's real credit outside its open action and removes credit on failure", async () => {
    const slug = "new-market-historic-district-new-market";
    const source = CREDITED_LOCAL_PLACE_PHOTOS[slug].image;
    const onPick = vi.fn();
    const metadata = vi.spyOn(mapListPhotoLoader, "loadData");
    await render(<MapList places={[row(slug)]} events={[]} userLoc={null} onPick={onPick} onPickEvent={() => {}} />);
    expect(image().getAttribute("src")).toBe(source.src);
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    await load();
    const credit = host.querySelector(".place-card-photo-credit")!;
    expect(credit.textContent).toContain(source.creator);
    expect(credit.textContent).toContain(source.modifications);
    expect(credit.querySelector(`a[href="${source.source_url}"]`)).not.toBeNull();
    expect(credit.querySelector(`a[href="${source.license.url}"]`)).not.toBeNull();
    expect(credit.closest("button")).toBeNull();
    await act(async () => credit.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPick).not.toHaveBeenCalled();
    await fail();
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    expect(host.textContent).toContain("New Market Historic District");
    expect(host.textContent).toContain("Hours not confirmed");
    expect(metadata).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("narrows an exactly credited Google thumbnail then falls through to the exact local park image", async () => {
    const place = { ...row("catoctin-mountain-park"), ...google };
    await render(<MapList places={[place]} events={[]} userLoc={null} onPick={() => {}} onPickEvent={() => {}} />);
    expect(image().getAttribute("src")).toContain("w=144");
    expect(image().getAttribute("src")).toContain("fallback=signal");
    await load();
    expect(host.textContent).toContain("Actual photographer");
    await fail();
    expect(image().getAttribute("src")).toBe("/history-photos/catoctin-mountain-park.jpg");
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    await load();
    expect(host.textContent).toContain("Vegemighty");
    expect(host.textContent).not.toContain("Actual photographer");
    expect(host.querySelector('a[href="https://creativecommons.org/publicdomain/zero/1.0/"]')).not.toBeNull();
  });

  it("does not render an unpaired Google URL or borrow local scenery for a similarly named place", async () => {
    const invalidPair = { ...row("new-market-shop"), ...google, google_photo_attribution: undefined };
    await render(<MapList places={[invalidPair]} events={[]} userLoc={null} onPick={() => {}} onPickEvent={() => {}} />);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
