// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PlaceHeroMedia, { type PlaceHeroPhoto } from "./PlaceHeroMedia";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const GOOGLE = "/api/place-photo?name=places%2Fone%2Fphotos%2Ftwo&w=1200";
const COMMONS = "/landmarks/fritchie.jpg";

/** Settle the current photo the way a browser would; next/image runs the
 *  caller's onLoad after a decode promise. */
async function settle(img: HTMLImageElement, outcome: "photo" | "signal" | "error") {
  await act(async () => {
    if (outcome === "error") {
      img.dispatchEvent(new Event("error"));
      return;
    }
    const size = outcome === "photo" ? [1200, 700] : [1, 1];
    Object.defineProperties(img, {
      naturalWidth: { configurable: true, value: size[0] },
      naturalHeight: { configurable: true, value: size[1] },
    });
    img.dispatchEvent(new Event("load"));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("PlaceHeroMedia", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const photos: PlaceHeroPhoto[] = [
    { src: GOOGLE, alt: "Barbara Fritchie House", credit: <span>Photo by A H · Google Maps</span> },
    { src: COMMONS, alt: "The Barbara Fritchie House", credit: <span>Photo by Acroterion · Wikimedia Commons</span> },
  ];

  async function render(list: PlaceHeroPhoto[]) {
    await act(async () =>
      root.render(
        <PlaceHeroMedia
          photos={list}
          width={1200}
          height={700}
          size="hero"
          priority
          aspectRatio="16/10"
          fallback={<div data-slot="map">South Market St</div>}
        />,
      ),
    );
  }

  const img = () => container.querySelector("img") as HTMLImageElement;

  it("credits a photo only after it has loaded", async () => {
    await render(photos);
    expect(img().getAttribute("src")).toContain("fallback=signal");
    expect(container.textContent).not.toContain("Google Maps");

    await settle(img(), "photo");
    expect(container.querySelector("[data-place-photo-credit]")?.textContent).toContain(
      "Photo by A H · Google Maps",
    );
    expect(container.querySelector("[data-slot='map']")).toBeNull();
  });

  it("moves to the next real photo when the proxy returns its failure signal", async () => {
    await render(photos);
    await settle(img(), "signal");

    expect(img().getAttribute("src")).toContain("fritchie.jpg");
    expect(container.textContent).not.toContain("Google Maps");
    expect(container.textContent).not.toContain("Wikimedia Commons");

    await settle(img(), "photo");
    expect(container.textContent).toContain("Photo by Acroterion · Wikimedia Commons");
  });

  it("becomes the map of the block when no photo loads, never an empty plate", async () => {
    await render(photos);
    await settle(img(), "error");
    await settle(img(), "signal");

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-place-hero-kind='photo']")).toBeNull();
    expect(container.querySelector("[data-slot='map']")?.textContent).toBe("South Market St");
  });
});
