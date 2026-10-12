// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Native fixture image exposes real React load/error handlers. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GooglePhotoAttribution } from "@/lib/integrations/google-places";
const imageCallbacks = vi.hoisted(() => new Map<string, { load: React.ReactEventHandler<HTMLImageElement>; error: React.ReactEventHandler<HTMLImageElement> }>());
vi.mock("next/image", () => ({ default: ({ src, alt, onLoad, onError, ...props }: { src: string; alt: string; onLoad: React.ReactEventHandler<HTMLImageElement>; onError: React.ReactEventHandler<HTMLImageElement>; "aria-hidden"?: boolean }) => {
  imageCallbacks.set(src, { load: onLoad, error: onError });
  return <img src={src} alt={alt} aria-hidden={props["aria-hidden"]} onLoad={onLoad} onError={onError} />;
} }));
import { MapPeekPhoto } from "./MapPeek";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const photoName = "places/fixture-venue/photos/fixture-front";
const src = `/api/place-photo?name=${encodeURIComponent(photoName)}&w=800`;
const credit: GooglePhotoAttribution = { photo_name: photoName, google_maps_uri: "https://www.google.com/maps/contrib/123/photo/456", authors: [{ display_name: "Fixture Photographer", uri: "https://www.google.com/maps/contrib/123" }] };

describe("MapPeek selected photo and source identity", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); openDetails.mockClear(); imageCallbacks.clear(); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  const openDetails = vi.fn();
  const render = async (source = src, googlePhoto = true) => act(async () => root.render(<MapPeekPhoto key="fixture-venue" src={source} placeName="Fixture venue" glyph="F" color="var(--app-brand)" googlePhoto={googlePhoto} onOpenDetails={openDetails} attribution={credit} googleMapsUri="https://maps.google.com/fixture" />));
  const load = async (width: number, height: number) => {
    const image = host.querySelector("img")!;
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: width });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: height });
    await act(async () => image.dispatchEvent(new Event("load")));
  };
  it("requests the transparent proxy signal and withholds venue alt and credit until genuine image bytes load", async () => {
    await render();
    expect(host.querySelector("img")?.src).toContain("fallback=signal");
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.querySelector("img")?.getAttribute("aria-hidden")).toBe("true");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await load(800, 600);
    expect(host.querySelector("img")?.alt).toBe("Photo of Fixture venue");
    expect(host.querySelector("img")?.hasAttribute("aria-hidden")).toBe(false);
    expect(host.textContent).toContain("Photo by Fixture Photographer");
    expect(host.querySelector(`a[href="${credit.google_maps_uri}"]`)).not.toBeNull();
    expect(host.querySelector("button a")).toBeNull();
    const action = host.querySelector("button")!;
    expect(action.getAttribute("aria-label")).toBe("Open details for Fixture venue");
    await act(async () => action.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(openDetails).toHaveBeenCalledOnce();
    const creditTargets = host.querySelector(".map-peek-source-credit")!;
    expect(creditTargets.className).toContain("[&_a]:min-h-11");
    expect(creditTargets.className).toContain("[&_a]:min-w-11");
    for (const link of host.querySelectorAll(".map-peek-source-credit a")) {
      expect(link.className).toContain("tap-44-y");
    }
  });
  it.each([[1, 1], [1, 600], [800, 1]])("replaces a %s by %s pixel signal with category artwork and no photo attribution", async (width, height) => {
    await render(); await load(width, height);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("[data-map-peek-photo-state=failed]")).toBeTruthy();
    expect(host.textContent).toBe("F");
    expect(host.querySelector("a")).toBeNull();
  });
  it("removes failed image bytes and their credit together even after a successful load", async () => {
    await render(); await load(800, 600);
    await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe("F");
    expect(host.querySelector("a")).toBeNull();
  });
  it("uses a new readiness boundary for a new source and never borrows the previous image's ready state", async () => {
    await render(); await load(800, 600);
    const next = "/api/place-photo?name=places%2Ffixture-venue%2Fphotos%2Ffixture-side&w=800";
    await render(next);
    expect(host.querySelector("img")?.src).toContain("fixture-side");
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await load(1, 1);
    await render(src);
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await load(800, 600);
    expect(host.textContent).toContain("Fixture Photographer");
  });
  it("retains focused Details through metadata/source changes and ignores stale image callbacks", async () => {
    const update = async (source?: string) => act(async () => root.render(<MapPeekPhoto key="fixture-venue" src={source} placeName="Fixture venue" glyph="F" color="var(--app-brand)" googlePhoto={true} onOpenDetails={openDetails} attribution={credit}><div><button type="button">Details</button></div></MapPeekPhoto>));
    await update();
    const details = host.querySelectorAll("button")[1];
    details.focus();
    await update(src);
    expect(host.querySelectorAll("button")[1]).toBe(details);
    expect(document.activeElement).toBe(details);
    await load(800, 600);
    const oldImage = host.querySelector("img")!;
    const oldCallbacks = imageCallbacks.get(oldImage.getAttribute("src")!)!;
    const next = "/api/place-photo?name=places%2Ffixture-venue%2Fphotos%2Ffixture-side&w=800";
    await update(next);
    expect(host.querySelectorAll("button")[1]).toBe(details);
    expect(document.activeElement).toBe(details);
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await act(async () => {
      oldCallbacks.load({ currentTarget: oldImage } as React.SyntheticEvent<HTMLImageElement>);
      oldCallbacks.error({ currentTarget: oldImage } as React.SyntheticEvent<HTMLImageElement>);
    });
    expect(host.querySelector("img")?.alt).toBe("");
    expect(host.textContent).not.toContain("Fixture Photographer");
    await load(900, 600);
    expect(host.textContent).toContain("Fixture Photographer");
    expect(document.activeElement).toBe(details);
  });
  it("keeps an unpictured venue actionable without a fake image or source credit", async () => {
    await act(async () => root.render(<MapPeekPhoto placeName="Fixture venue" glyph="F" color="var(--app-brand)" googlePhoto={false} onOpenDetails={openDetails} />));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("a")).toBeNull();
    await act(async () => host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(openDetails).toHaveBeenCalledOnce();
  });
  it("keeps Radius-owned source bytes without borrowing Google credits", async () => {
    await render("/photos/fixture-owned.jpg", false); await load(900, 600);
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/photos/fixture-owned.jpg");
    expect(host.querySelector("img")?.alt).toBe("Photo of Fixture venue");
    expect(host.textContent).not.toContain("Fixture Photographer");
    expect(host.querySelector("a")).toBeNull();
  });
});
