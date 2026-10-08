// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AerialBeat from "./AerialBeat";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// Downtown Frederick, beside the owner's "FALL COLORS" drone frame.
const FALL_COLORS = { lng: -77.410188, lat: 39.416312 };

async function settle(img: HTMLImageElement, outcome: "photo" | "error") {
  await act(async () => {
    if (outcome === "error") {
      img.dispatchEvent(new Event("error"));
      return;
    }
    Object.defineProperties(img, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 1000 },
    });
    img.dispatchEvent(new Event("load"));
  });
  // next/image runs the user's onLoad after a decode promise.
  await act(async () => {
    await Promise.resolve();
  });
}

describe("AerialBeat in the browser", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root.render(
        <AerialBeat lat={FALL_COLORS.lat} lng={FALL_COLORS.lng} municipality="frederick" />,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("holds the scrim and caption until the image decodes", async () => {
    expect(host.querySelector("figure")).not.toBeNull();
    expect(host.querySelector("figcaption")).toBeNull();

    await settle(host.querySelector("img")!, "photo");

    expect(host.querySelector("figcaption")?.textContent).toContain("Frederick City from the air");
    expect(host.querySelector("figcaption")?.textContent).toContain("From above");
  });

  it("removes the whole figure when the image fails", async () => {
    await settle(host.querySelector("img")!, "error");

    expect(host.querySelector("figure")).toBeNull();
    expect(host.textContent).not.toContain("from the air");
  });
});
