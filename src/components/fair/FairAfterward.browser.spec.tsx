// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";

import FairAfterward, { FAIR_AFTERWARD_PHOTO_CREDIT } from "./FairAfterward";
import FairDayWorkspace from "./FairDayWorkspace";
import { buildFairDayWorkspaceData } from "./buildFairDayWorkspaceData";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function settle(image: HTMLImageElement, outcome: "load" | "error", width = 960) {
  Object.defineProperty(image, "naturalWidth", {
    configurable: true,
    value: outcome === "load" ? width : 0,
  });
  image.dispatchEvent(new Event(outcome));
}

describe("FairAfterward photo frames", () => {
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

  async function render() {
    await act(async () => {
      root.render(createElement(FairAfterward));
    });
  }

  function frame(id: string): HTMLElement | null {
    return container.querySelector(`[data-fair-afterward-frame="${id}"]`);
  }

  it("credits a frame only after its image loads", async () => {
    await render();
    const night = frame("night");
    const image = night?.querySelector("img");
    if (!night || !image) throw new Error("Missing the night frame.");

    expect(night.textContent).not.toContain(FAIR_AFTERWARD_PHOTO_CREDIT);
    await act(async () => settle(image, "load"));
    expect(night.textContent).toContain(FAIR_AFTERWARD_PHOTO_CREDIT);
    expect(frame("midway")?.textContent).not.toContain(
      FAIR_AFTERWARD_PHOTO_CREDIT,
    );
  });

  it("removes a frame whose image fails, and the strip when all fail", async () => {
    await render();
    const midway = frame("midway")?.querySelector("img");
    if (!midway) throw new Error("Missing the midway frame.");

    await act(async () => settle(midway, "error"));
    expect(frame("midway")).toBeNull();
    expect(frame("night")).not.toBeNull();

    for (const id of ["night", "ferris-wheel"]) {
      const image = frame(id)?.querySelector("img");
      if (!image) throw new Error(`Missing the ${id} frame.`);
      await act(async () => settle(image, "error"));
    }
    expect(container.querySelector("[data-fair-afterward-photos]")).toBeNull();
    expect(container.textContent).toContain(
      "The 2026 Great Frederick Fair ran September 18 to 26.",
    );
    expect(container.textContent).toContain("See what's on this weekend");
  });

  it("treats an empty decode as a failed frame, not a photo", async () => {
    await render();
    const ferris = frame("ferris-wheel")?.querySelector("img");
    if (!ferris) throw new Error("Missing the Ferris wheel frame.");

    await act(async () => settle(ferris, "load", 0));
    expect(frame("ferris-wheel")).toBeNull();
  });
});

describe("FairDayWorkspace phase on the device clock", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(Date.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) =>
      window.clearTimeout(handle),
    );
    const stored = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => void stored.set(key, value),
        removeItem: (key: string) => void stored.delete(key),
      },
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    window.history.replaceState({}, "", "/moments/great-frederick-fair-2026#now");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function renderAt(reviewedAt: string, deviceNow: string) {
    vi.setSystemTime(new Date(deviceNow));
    const data = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date(reviewedAt),
    );
    await act(async () => {
      root.render(createElement(FairDayWorkspace, { data }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(20));
  }

  function dockLabels(): Array<string | null> {
    return Array.from(
      container.querySelectorAll("[data-mobile-action-bar] nav button"),
    ).map((button) => button.getAttribute("aria-label"));
  }

  it("ends a page cached on the last night once the device clock passes midnight", async () => {
    await renderAt("2026-09-27T02:00:00Z", "2026-09-27T04:30:00Z");

    expect(container.querySelector('[data-fair-home="afterward"]')).not.toBeNull();
    expect(container.querySelector("[data-fair-at-a-glance]")).toBeNull();
    expect(dockLabels()).toEqual(["Home", "Map"]);
  });

  it("follows a Fair-week fixture clock so release journeys keep their guide", async () => {
    await renderAt("2026-10-07T16:00:00Z", "2026-09-10T16:00:00Z");

    expect(container.querySelector('[data-fair-home="afterward"]')).toBeNull();
    expect(container.querySelector("[data-fair-at-a-glance]")).not.toBeNull();
    expect(dockLabels()).toEqual(["Home", "Program", "Map", "My Day"]);
  });

  it("keeps the post-fair record when the device agrees with the server", async () => {
    await renderAt("2026-10-07T16:00:00Z", "2026-10-07T16:05:00Z");

    expect(container.querySelector('[data-fair-home="afterward"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Review tickets");
    expect(dockLabels()).toEqual(["Home", "Map"]);
  });
});
