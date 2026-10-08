// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FoodTruckIdentity from "./FoodTruckIdentity";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const DOP = {
  slug: "dop-pizza",
  name: "dōp Pizza",
  cuisine: "Wood-fired pizza",
  kind: "food" as const,
};

async function settle(img: HTMLImageElement, outcome: "logo" | "empty" | "error") {
  await act(async () => {
    if (outcome === "error") {
      img.dispatchEvent(new Event("error"));
      return;
    }
    const size = outcome === "logo" ? [640, 640] : [0, 0];
    Object.defineProperties(img, {
      naturalWidth: { configurable: true, value: size[0] },
      naturalHeight: { configurable: true, value: size[1] },
    });
    img.dispatchEvent(new Event("load"));
  });
  // next/image runs the user's onLoad after a decode promise.
  await act(async () => {
    await Promise.resolve();
  });
}

describe("FoodTruckIdentity in the browser", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps a logo that decodes", async () => {
    act(() => root.render(<FoodTruckIdentity truck={DOP} size="thumb" />));
    await settle(host.querySelector("img")!, "logo");
    expect(host.querySelector('[data-photo-state="official-mark"]')).not.toBeNull();
    expect(host.querySelector("img")).not.toBeNull();
  });

  it("falls back to the Truck mark when the logo fails to load", async () => {
    act(() => root.render(<FoodTruckIdentity truck={DOP} size="thumb" />));
    await settle(host.querySelector("img")!, "error");
    expect(host.querySelector('[data-photo-state="fallback"]')).not.toBeNull();
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("svg")).not.toBeNull();
  });

  it("falls back to the Truck mark when the logo decodes empty", async () => {
    act(() => root.render(<FoodTruckIdentity truck={DOP} />));
    await settle(host.querySelector("img")!, "empty");
    expect(host.querySelector('[data-photo-state="fallback"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/DP/);
  });
});
