// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheGeolocationPosition,
  readCachedPosition,
  useGeolocation,
} from "./useGeolocation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ id }: { id: string }) {
  const geolocation = useGeolocation();
  return createElement(
    "button",
    {
      id,
      "data-status": geolocation.state.status,
      onClick: () => void geolocation.requestIfGranted(),
    },
    geolocation.state.status,
  );
}

describe("shared browser geolocation state", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("updates every mounted surface when a consented fix is cached", async () => {
    await act(async () => {
      root.render(
        createElement(
          "div",
          null,
          createElement(Probe, { id: "one" }),
          createElement(Probe, { id: "two" }),
        ),
      );
    });

    await act(async () => {
      cacheGeolocationPosition({
        lng: -77.4105,
        lat: 39.4143,
        accuracy: 18,
        timestamp: Date.now(),
      });
    });

    expect(container.querySelector("#one")?.getAttribute("data-status")).toBe(
      "granted",
    );
    expect(container.querySelector("#two")?.getAttribute("data-status")).toBe(
      "granted",
    );
  });

  it("refreshes only an already-granted permission and reuses that device fix", async () => {
    const query = vi.fn().mockResolvedValue({ state: "granted" });
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          longitude: -77.4105,
          latitude: 39.4143,
          accuracy: 18,
        },
      } as GeolocationPosition);
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    await act(async () => {
      root.render(createElement(Probe, { id: "probe" }));
    });
    await act(async () => {
      (container.querySelector("#probe") as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(readCachedPosition()).toEqual({ lng: -77.4105, lat: 39.4143 });
    expect(container.querySelector("#probe")?.getAttribute("data-status")).toBe(
      "granted",
    );
  });

  it("does not request a position when browser permission is not granted", async () => {
    const query = vi.fn().mockResolvedValue({ state: "prompt" });
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    await act(async () => {
      root.render(createElement(Probe, { id: "probe" }));
    });
    await act(async () => {
      (container.querySelector("#probe") as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(readCachedPosition()).toBeNull();
  });
});
