// @vitest-environment jsdom

import LocationCacheExpiry from "@/components/privacy/LocationCacheExpiry";
import { clearGeoPosition } from "@/lib/device-location-cache";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  announceLocationRefusal,
  cacheGeolocationPosition,
  GEOLOCATION_CHANGE_EVENT,
  readCachedPosition,
  resetLocationRefusalForTests,
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
    clearGeoPosition();
    window.sessionStorage.clear();
    resetLocationRefusalForTests();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    clearGeoPosition();
    vi.useRealTimers();
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

  it("tells every mounted surface when another surface's request is refused, until a later grant", async () => {
    await act(async () => {
      root.render(createElement("div", null, createElement(Probe, { id: "one" }), createElement(Probe, { id: "two" })));
    });
    await act(async () => announceLocationRefusal("denied"));
    expect(container.querySelector("#one")?.getAttribute("data-status")).toBe("denied");
    expect(container.querySelector("#two")?.getAttribute("data-status")).toBe("denied");

    await act(async () => {
      cacheGeolocationPosition({ lng: -77.4105, lat: 39.4143, accuracy: 18, timestamp: Date.now() });
    });
    expect(container.querySelector("#two")?.getAttribute("data-status")).toBe("granted");
  });

  it("deletes the idle fix at its deadline, even after the requesting screen unmounts", async () => {
    vi.useFakeTimers();
    const fix = { lat: 39.414378, lng: -77.410692, accuracy: 10, timestamp: Date.now() };
    await act(async () => root.render(createElement(Probe, { id: "one" })));
    await act(async () => cacheGeolocationPosition(fix));
    await act(async () => root.render(createElement(LocationCacheExpiry)));
    await act(async () => vi.advanceTimersByTime(30 * 60_000 - 1));
    expect(window.sessionStorage.getItem("fr_geo_v1")).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(window.sessionStorage.getItem("fr_geo_v1")).toBeNull();
  });

  it.each(["pageshow", "visibilitychange"])("discards a legacy fix on %s after the browser suspended timers", async event => {
    vi.useFakeTimers();
    const start = Date.now();
    window.sessionStorage.setItem("fr_geo_v1", JSON.stringify({ lat: 39.4, lng: -77.4, accuracy: 15, timestamp: start }));
    await act(async () => root.render(createElement("div", null, createElement(LocationCacheExpiry), createElement(Probe, { id: "one" }))));
    expect(container.querySelector("#one")?.textContent).toBe("granted");
    vi.setSystemTime(start + 31 * 60_000);
    await act(async () => { (event === "pageshow" ? window : document).dispatchEvent(new Event(event)); });
    expect(window.sessionStorage.getItem("fr_geo_v1")).toBeNull();
    expect(container.querySelector("#one")?.textContent).toBe("idle");
  });

  it("does not let an older timer remove a newer fix or retain a late device callback", async () => {
    vi.useFakeTimers();
    const first = { lat: 39.4, lng: -77.4, accuracy: 15, timestamp: Date.now() };
    cacheGeolocationPosition(first);
    vi.advanceTimersByTime(20 * 60_000);
    cacheGeolocationPosition({ ...first, timestamp: Date.now(), lat: 39.5 });
    vi.advanceTimersByTime(10 * 60_000);
    expect(readCachedPosition()?.lat).toBe(39.5);
    vi.advanceTimersByTime(20 * 60_000);
    expect(window.sessionStorage.getItem("fr_geo_v1")).toBeNull();
    cacheGeolocationPosition(first);
    expect(window.sessionStorage.getItem("fr_geo_v1")).toBeNull();
  });

  it("lets a refusal win over a cached fix without announcing a new fix", async () => {
    await act(async () => {
      cacheGeolocationPosition({ lng: -77.4105, lat: 39.4143, accuracy: 18, timestamp: Date.now() });
      root.render(createElement(Probe, { id: "one" }));
    });
    expect(container.querySelector("#one")?.getAttribute("data-status")).toBe("granted");
    const fixListener = vi.fn();
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, fixListener);
    await act(async () => announceLocationRefusal("denied"));
    window.removeEventListener(GEOLOCATION_CHANGE_EVENT, fixListener);
    expect(container.querySelector("#one")?.getAttribute("data-status")).toBe("denied");
    expect(fixListener).not.toHaveBeenCalled();
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
