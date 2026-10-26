// @vitest-environment jsdom

import { act, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordPlaceCardPhotoResult, selectedPlaceCardPhoto, type PlaceCardPhotoPlan, type PlaceCardPhotoResult, type PlaceCardPhotoState } from "@/lib/place-card-photo";

const sdkLoads = vi.hoisted(() => new Map<string, ImgHTMLAttributes<HTMLImageElement>["onLoad"]>());
vi.mock("next/image", () => ({
  default: ({ src, alt, onLoad, onLoadCapture, onError }: ImgHTMLAttributes<HTMLImageElement>) => {
    if (typeof src !== "string") throw new Error("An explicit offline source is required.");
    sdkLoads.set(src, onLoad);
    // The installed SDK can suppress its later callback after the synthetic
    // mount callback. Deliver native events independently from that callback.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} onLoadCapture={onLoadCapture} onError={onError} />;
  },
}));
import PlaceCardPhoto from "./PlaceCardPhoto";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const first = "/images/offline-first-photo.jpg";
const second = "/images/offline-second-photo.jpg";
const plan: PlaceCardPhotoPlan = { key: "offline-two-source-plan", sources: [first, second].map(src => ({ kind: "owned", src, alt: "An offline fixture." })) };

describe("PlaceCardPhoto native lazy-load continuity", () => {
  let container: HTMLDivElement;
  let root: Root;
  let results = vi.fn<(src: string, result: PlaceCardPhotoResult) => void>();
  beforeEach(() => {
    sdkLoads.clear(); results = vi.fn();
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No test may request photo bytes."); }));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });
  function Harness() {
    const [state, setState] = useState<PlaceCardPhotoState | null>(null);
    const source = selectedPlaceCardPhoto(plan, state);
    return <><output>{source?.src ?? "no-photo"}</output><PlaceCardPhoto source={source} onResult={(src, result) => {
      results(src, result); setState(previous => recordPlaceCardPhotoResult(plan, previous, src, result));
    }} /></>;
  }
  async function render() { await act(async () => root.render(<Harness />)); }
  function image() { return container.querySelector<HTMLImageElement>("img")!; }
  function dimensions(target: HTMLImageElement, width: number, height: number, currentSrc: string) {
    Object.defineProperties(target, {
      naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height },
      currentSrc: { configurable: true, value: currentSrc },
    });
  }
  async function sdkLoad(target = image()) {
    await act(async () => sdkLoads.get(target.getAttribute("src")!)!({ currentTarget: target } as SyntheticEvent<HTMLImageElement>));
  }
  async function native(target: HTMLImageElement, type: "load" | "error") {
    await act(async () => target.dispatchEvent(new Event(type)));
  }

  it("retains the pending image until a real native load even when Next suppresses its callback", async () => {
    await render(); const pending = image(); dimensions(pending, 0, 0, ""); await sdkLoad(pending);
    expect(results).not.toHaveBeenCalled(); expect(image()).toBe(pending);
    dimensions(pending, 600, 400, first); await native(pending, "load");
    expect(results.mock.calls).toEqual([[first, "loaded"]]); expect(image()).toBe(pending);
    expect(container.querySelector("output")?.textContent).toBe(first); expect(fetch).not.toHaveBeenCalled();
  });

  it("lets a native error with empty currentSrc advance the source, then settle the next image", async () => {
    await render(); const pending = image(); dimensions(pending, 0, 0, ""); await sdkLoad(pending);
    await native(pending, "error"); expect(image().getAttribute("src")).toBe(second);
    const next = image(); dimensions(next, 0, 0, ""); await sdkLoad(next);
    // A late detached SDK callback cannot replace the new pending native owner.
    await sdkLoad(pending); dimensions(next, 700, 500, second); await native(next, "load");
    expect(results.mock.calls).toEqual([[first, "failed"], [second, "loaded"]]);
    expect(container.querySelector("output")?.textContent).toBe(second); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([[0, 0], [1, 1], [1, 300], [400, 1]])("preserves a selected-source decode/placeholder failure at %ix%i", async (width, height) => {
    await render(); const failed = image(); dimensions(failed, width, height, first); await sdkLoad(failed);
    expect(results.mock.calls).toEqual([[first, "failed"]]); expect(image().getAttribute("src")).toBe(second);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not treat a real native zero-size load as the premature synthetic callback", async () => {
    await render(); const pending = image(); dimensions(pending, 0, 0, ""); await sdkLoad(pending);
    await native(pending, "load"); expect(results.mock.calls).toEqual([[first, "failed"]]);
    expect(image().getAttribute("src")).toBe(second);
  });

  it("leaves ordinary successful SDK loads on their existing path", async () => {
    await render(); const loaded = image(); dimensions(loaded, 600, 400, first);
    await native(loaded, "load"); expect(results).not.toHaveBeenCalled(); await sdkLoad(loaded);
    expect(results.mock.calls).toEqual([[first, "loaded"]]); expect(image()).toBe(loaded);
  });
});
