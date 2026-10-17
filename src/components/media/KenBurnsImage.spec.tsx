// @vitest-environment jsdom
import { act, createElement, type ImgHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imageCallbacks = vi.hoisted(() => new Map<string, Pick<ImgHTMLAttributes<HTMLImageElement>, "onError" | "onLoad">>());
vi.mock("next/image", async () => {
  const { useLayoutEffect } = await import("react");
  return {
    default: function ImageTransport({
      src,
      alt,
      className,
      onLoad,
      onError,
      ...rest
    }: ImgHTMLAttributes<HTMLImageElement>) {
      useLayoutEffect(() => {
        if (typeof src === "string") imageCallbacks.set(src, { onLoad, onError });
      }, [src, onLoad, onError]);
      return createElement("img", { src, alt, className, onLoad, onError, ...rest });
    },
  };
});

import KenBurnsImage from "./KenBurnsImage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("KenBurnsImage", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    imageCallbacks.clear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("shows a still cover until the real image loads, then starts motion", async () => {
    act(() => root.render(<KenBurnsImage src="https://s1.ticketm.net/dam/a/cover.jpg" className="object-cover" />));
    const image = host.querySelector("img")!;
    expect(image.getAttribute("data-cover-motion")).toBe("still");
    expect(image.className).toContain("ken-burns");
    expect(image.className).not.toContain("ken-burns-ready");
    Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: 600, configurable: true });
    await act(async () => {
      image.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });
    expect(host.querySelector("img")?.getAttribute("data-cover-motion")).toBe("ready");
    expect(host.querySelector("img")?.className).toContain("ken-burns-ready");
  });

  it("hides a place-photo fallback advertised by x-photo-fallback", async () => {
    const src = "/api/place-photo?name=places%2Fexample%2Fphotos%2Fone&fallback=signal";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("fallback", {
      headers: { "x-photo-fallback": "daily-cap" },
    })));
    act(() => root.render(<KenBurnsImage src={src} confirmFallbackHeader />));
    const image = host.querySelector("img")!;
    Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: 600, configurable: true });
    await act(async () => {
      image.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });
    expect(host.querySelector("img")).toBeNull();
  });

  it("hides the 1px failure signal without waiting on a second request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    act(() => root.render(<KenBurnsImage src="/api/place-photo?name=places%2Fexample%2Fphotos%2Fone&fallback=signal" />));
    const image = host.querySelector("img")!;
    Object.defineProperty(image, "naturalWidth", { value: 1, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: 1, configurable: true });
    await act(async () => {
      image.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });
    expect(host.querySelector("img")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
