import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheGeolocationPosition,
  GEOLOCATION_CHANGE_EVENT,
  readCachedPosition,
  type GeoPosition,
} from "./useGeolocation";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function stubWindow(pathname = "/today", search = "") {
  const target = new EventTarget();
  Object.assign(target, {
    sessionStorage: memoryStorage(),
    location: { pathname, search },
  });
  vi.stubGlobal("window", target);
}

beforeEach(() => {
  stubWindow();
});

describe("shared geolocation cache", () => {
  it("persists a consented fix and announces it to same-tab surfaces", () => {
    const changed = vi.fn();
    window.addEventListener(GEOLOCATION_CHANGE_EVENT, changed);
    const position: GeoPosition = {
      lng: -77.4105,
      lat: 39.4143,
      accuracy: 18,
      timestamp: Date.now(),
    };

    cacheGeolocationPosition(position);

    expect(readCachedPosition()).toEqual({
      lng: position.lng,
      lat: position.lat,
    });
    expect(changed).toHaveBeenCalledOnce();
  });

  it("marks a clean filtered map as safe to center without prompting", () => {
    stubWindow("/map", "?intent=coffee");
    const position: GeoPosition = {
      lng: -77.4105,
      lat: 39.4143,
      accuracy: 18,
      timestamp: Date.now(),
    };
    cacheGeolocationPosition(position);

    expect(readCachedPosition()).toEqual({
      lng: position.lng,
      lat: position.lat,
      preferMapCamera: true,
    });
  });

  it.each(["?at=39.41,-77.41", "?c=-77.41,39.41,14", "?in=brunswick"])(
    "preserves explicit map framing for %s",
    (search) => {
      stubWindow("/map", search);
      const position: GeoPosition = {
        lng: -77.4105,
        lat: 39.4143,
        accuracy: 18,
        timestamp: Date.now(),
      };
      cacheGeolocationPosition(position);

      expect(readCachedPosition()).toEqual({
        lng: position.lng,
        lat: position.lat,
      });
    },
  );

  it("does not return an expired fix", () => {
    cacheGeolocationPosition({
      lng: -77.4105,
      lat: 39.4143,
      accuracy: 18,
      timestamp: Date.now() - 31 * 60 * 1000,
    });

    expect(readCachedPosition()).toBeNull();
  });
});
