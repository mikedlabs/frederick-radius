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
import SearchPlaceVisual, { SearchPlaceVisualImage, SearchPlaceVisualCredit } from "./SearchPlaceVisual";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const commons = freeSearchPlaceVisual({ slug: "cunningham-falls-state-park-thurmont" })!;
const owned = freeSearchPlaceVisual({ slug: "carroll-creek-linear-park-frederick" })!;

describe("Find source identity and failure recovery", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); pendingLoads.clear(); });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
  async function render(source: PlaceCardPhotoSource | null = commons) {
    await act(async () => root.render(<SearchPlaceVisual source={source}>
      <Link href="/places/cunningham-falls-state-park-thurmont" prefetch={false}><SearchPlaceVisualImage fallback={<span>Place mark</span>} />Cunningham Falls</Link>
      <SearchPlaceVisualCredit />
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
});
