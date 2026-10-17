// @vitest-environment jsdom
import { act, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceCardPhotoSource } from "@/lib/place-card-photo";
import { freeSearchPlaceVisual } from "@/lib/search/place-visual";
import Link from "next/link";

const pendingLoads = vi.hoisted(() => new Map<string, ImgHTMLAttributes<HTMLImageElement>["onLoad"]>());
vi.mock("next/image", () => ({ default: ({ src, alt, onLoad, onError }: ImgHTMLAttributes<HTMLImageElement>) => {
  pendingLoads.set(String(src), onLoad);
  // Native fixture only; no external photo request occurs in jsdom.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onLoad={onLoad} onError={onError} />;
} }));
import SearchPlaceVisual, { SearchPlaceVisualImage, SearchPlaceVisualCredit, SearchPlaceLead } from "./SearchPlaceVisual";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const commons = freeSearchPlaceVisual({ slug: "cunningham-falls-state-park-thurmont" })!;
const owned = freeSearchPlaceVisual({ slug: "carroll-creek-linear-park-frederick" })!;

describe("Find source identity and failure recovery", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); pendingLoads.clear(); });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function render(source: PlaceCardPhotoSource | null = commons) {
    await act(async () => root.render(<SearchPlaceVisual source={source}>
      <Link href="/places/cunningham-falls-state-park-thurmont" prefetch={false}><SearchPlaceVisualImage fallback={<span>Place mark</span>} />Cunningham Falls</Link>
      <SearchPlaceVisualCredit />
    </SearchPlaceVisual>));
  }
  async function renderLead(source: PlaceCardPhotoSource | null, name = "Schifferstadt Architectural Museum") {
    await act(async () => root.render(<SearchPlaceVisual source={source} lead>
      <SearchPlaceLead fallback={<span>Place mark</span>} actions={<>
        <Link href="/places/schifferstadt-architectural-museum-frederick?returnTo=%2Fsearch%3Fq%3DSchifferstadt" prefetch={false}>View place</Link>
        <Link href="/map?place=schifferstadt-architectural-museum-frederick&in=county" prefetch={false}>Map</Link>
      </>}><h2>{name}</h2><p>Museums · Frederick City</p><span>Unconfirmed</span></SearchPlaceLead>
    </SearchPlaceVisual>));
  }
  async function load(image: HTMLImageElement, size = 600) {
    Object.defineProperties(image, { naturalWidth: { configurable: true, value: size }, naturalHeight: { configurable: true, value: size } });
    await act(async () => image.dispatchEvent(new Event("load")));
  }

  it("shows the exact credit only after a usable image loads, outside the real result anchor", async () => {
    await render();
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    await load(host.querySelector("img")!);
    expect(host.textContent).toContain("Photo by Alyson Hurt.");
    expect(host.querySelector('a[href^="https://commons.wikimedia.org/wiki/File:"]')).not.toBeNull();
    expect(host.querySelector('a[href^="https://creativecommons.org/"]')).not.toBeNull();
    expect(host.querySelector("a a")).toBeNull();
    expect(host.querySelector('a[href^="/places/"]')?.textContent).toContain("Cunningham Falls");
  });

  it.each(["error", "transparent"])("keeps the real result and removes both failed media and credit after %s", async (failure) => {
    await render();
    const image = host.querySelector("img")!;
    await load(image);
    expect(host.querySelector(".place-card-photo-credit")).not.toBeNull();
    if (failure === "error") await act(async () => image.dispatchEvent(new Event("error")));
    else await load(image, 1);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    expect(host.textContent).toContain("Place mark");
    expect(host.querySelector('a[href^="/places/"]')).not.toBeNull();
    await act(async () => pendingLoads.get(commons.src)?.({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as SyntheticEvent<HTMLImageElement>));
    expect(host.querySelector("img")).toBeNull();
  });

  it("ignores a late old-source load instead of borrowing its credit for the new result", async () => {
    await render();
    const oldLoad = pendingLoads.get(commons.src);
    await render(owned);
    await load(host.querySelector("img")!);
    await act(async () => oldLoad?.({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as SyntheticEvent<HTMLImageElement>));
    expect(host.querySelector("img")?.getAttribute("src")).toBe(owned.src);
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
  });

  it("does not reuse loaded credit when metadata changes under the same image URL", async () => {
    await render();
    await load(host.querySelector("img")!);
    if (commons.kind !== "curated") throw new Error("Expected Commons fixture.");
    await render({ ...commons, photo: { ...commons.photo, author: "Changed source contributor" } });
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    await load(host.querySelector("img")!);
    expect(host.textContent).toContain("Changed source contributor");
    expect(host.textContent).not.toContain("Alyson Hurt");
  });

  it("keeps missing and owned photography free of third-party credit", async () => {
    await render(null);
    expect(host.querySelector("img")).toBeNull();
    await render(owned);
    await load(host.querySelector("img")!);
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
  });
  it("shows one local licensed lead and all source facts, then collapses only the failed photo and credit", async () => {
    const local = freeSearchPlaceVisual({ slug: "schifferstadt-architectural-museum-frederick" })!;
    await renderLead(local);
    const image = host.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("/history-photos/schifferstadt.jpg");
    expect(host.querySelector('[data-search-place-photo-frame="lead"]')).not.toBeNull();
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    await load(image);
    expect(host.textContent).toContain("Pete Giove-Fourwinds");
    expect(host.textContent).toContain("Resized and converted for display; cards may crop the image responsively.");
    expect(host.querySelector('a[href="https://creativecommons.org/licenses/by-sa/3.0/"]')).not.toBeNull();
    expect(host.querySelector("a a")).toBeNull();
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector('[data-search-place-photo-frame="lead"]')).toBeNull();
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    expect(host.querySelector("h2")?.textContent).toBe("Schifferstadt Architectural Museum");
    expect(host.textContent).toContain("Unconfirmed");
    expect(host.querySelector('a[href^="/places/"]')?.textContent).toBe("View place");
    expect(host.querySelector('a[href^="/map?"]')).not.toBeNull();
  });

  it("uses a single sharper width of the same free Commons source without changing its record", async () => {
    const original = commons.src;
    await renderLead(commons);
    expect(host.querySelectorAll("img")).toHaveLength(1);
    const src = host.querySelector("img")!.getAttribute("src")!;
    expect(new URL(src).searchParams.get("width")).toBe("720");
    expect(new URL(src).pathname).toBe(new URL(original).pathname);
    expect(commons.src).toBe(original);
    await load(host.querySelector("img")!);
    expect(host.textContent).toContain("Alyson Hurt");
  });

  it("ignores an old A callback after A → B → A instead of reviving its decoded credit", async () => {
    const local = freeSearchPlaceVisual({ slug: "schifferstadt-architectural-museum-frederick" })!;
    await renderLead(local);
    const oldLoad = pendingLoads.get(local.src)!;
    await renderLead(owned);
    await renderLead(local);
    await act(async () => oldLoad({ currentTarget: { naturalWidth: 600, naturalHeight: 400 } } as SyntheticEvent<HTMLImageElement>));
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    await load(host.querySelector("img")!);
    expect(host.textContent).toContain("Pete Giove-Fourwinds");
  });

  it("defers an already selected Google lead to one visible no-store response and never retries on decode failure", async () => {
    let enter!: () => void;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { enter = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
      observe() {} disconnect() {}
    });
    const create = vi.fn(() => "blob:one-selected-search-photo");
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    const fetcher = vi.fn(async () => new Response(new Blob(["fixture-only-bytes"], { type: "image/jpeg" }), { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetcher);
    const photoName = "places/selected-test/photos/canonical";
    const source: PlaceCardPhotoSource = { kind: "google", src: `/api/place-photo?name=${encodeURIComponent(photoName)}&w=256&fallback=signal`, alt: "",
      attribution: { photo_name: photoName, google_maps_uri: "https://www.google.com/maps/place/test/data=!3m1!1e3", authors: [{ display_name: "Fixture contributor" }] } };
    await renderLead(source);
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.querySelector("img")).toBeNull();
    await act(async () => enter());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(source.src, expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
    const image = host.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("blob:one-selected-search-photo");
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    await load(image);
    expect(host.textContent).toContain("Fixture contributor");
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:one-selected-search-photo");
    expect(host.querySelector('a[href^="/places/"]')).not.toBeNull();
  });

  it("requires a new decode for replacement Google credit on the same bytes without fetching again", async () => {
    let enter!: () => void;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { enter = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
      observe() {} disconnect() {}
    });
    const create = vi.fn(() => "blob:one-source-new-credit");
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = vi.fn(); });
    const fetcher = vi.fn(async () => new Response(new Blob(["fixture-only-bytes"], { type: "image/jpeg" }), { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetcher);
    const photoName = "places/selected-test/photos/credit-replacement";
    const source: PlaceCardPhotoSource = { kind: "google", src: `/api/place-photo?name=${encodeURIComponent(photoName)}&w=256&fallback=signal`, alt: "",
      attribution: { photo_name: photoName, google_maps_uri: "https://www.google.com/maps/place/test/data=!3m1!1e3", authors: [{ display_name: "Original fixture contributor" }] } };
    await renderLead(source);
    await act(async () => enter());
    const originalImage = host.querySelector("img")!;
    await load(originalImage);
    expect(host.textContent).toContain("Original fixture contributor");
    await renderLead({ ...source, attribution: { ...source.attribution, authors: [{ display_name: "Replacement fixture contributor" }] } });
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    const newImage = host.querySelector("img")!;
    expect(newImage).not.toBe(originalImage);
    expect(newImage.getAttribute("src")).toBe(originalImage.getAttribute("src"));
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(source.src, expect.objectContaining({ cache: "no-store" }));
    expect(create).toHaveBeenCalledTimes(1);
    await load(newImage);
    expect(host.textContent).toContain("Replacement fixture contributor");
    expect(host.textContent).not.toContain("Original fixture contributor");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

});
