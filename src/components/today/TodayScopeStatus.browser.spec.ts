// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayScopeStatus from "./TodayScopeStatus";
import { setScope } from "@/lib/scope";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type GeoErrorCallback = (error: {
  code: number;
  message: string;
  PERMISSION_DENIED: number;
}) => void;

function mockNavigator(options: {
  permissionState?: PermissionState;
  getCurrentPosition?: ReturnType<typeof vi.fn>;
}): { query: ReturnType<typeof vi.fn>; getCurrentPosition: ReturnType<typeof vi.fn> } {
  const query = vi
    .fn()
    .mockResolvedValue({ state: options.permissionState ?? "prompt" });
  const getCurrentPosition = options.getCurrentPosition ?? vi.fn();
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query },
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  return { query, getCurrentPosition };
}

describe("TodayScopeStatus location memory", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    // vitest's jsdom exposes window.localStorage without working methods, so
    // stand up the repo's in-memory stub; getScope/setScope reach it through
    // safeStorage(). A fresh Map per test keeps scope isolated.
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
    });
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

  const render = async () => {
    await act(async () => {
      root.render(createElement(TodayScopeStatus));
    });
    // requestIfGranted() resolves the Permissions query in a microtask.
    await act(async () => {
      await Promise.resolve();
    });
  };

  it("silently refreshes an already-granted fix when the lens is Near me", async () => {
    setScope("nearme");
    const { query, getCurrentPosition } = mockNavigator({
      permissionState: "granted",
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success({
          coords: { longitude: -77.4105, latitude: 39.4143, accuracy: 18 },
        } as GeolocationPosition);
      }),
    });

    await render();

    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    // With the fix restored the row no longer offers a location action.
    expect(container.querySelector("button")).toBeNull();
  });

  it("never checks or requests location outside the Near me lens", async () => {
    setScope("county");
    const { query, getCurrentPosition } = mockNavigator({
      permissionState: "granted",
    });

    await render();

    expect(query).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(container.querySelector("button")?.textContent).toBe(
      "Use my location",
    );
  });

  it("offers manual town selection after location is denied", async () => {
    setScope("county");
    mockNavigator({
      getCurrentPosition: vi.fn(
        (_success: PositionCallback, error: GeoErrorCallback) => {
          error({ code: 1, message: "User denied", PERMISSION_DENIED: 1 });
        },
      ),
    });

    await render();
    await act(async () => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });

    expect(container.querySelector("button")).toBeNull();
    expect(
      container.querySelector('[data-testid="today-location-blocked"]')
        ?.textContent,
    ).toBe(
      "Location is off. Choose a town to keep browsing.",
    );
  });

  it("keeps the retry button on a timeout error", async () => {
    setScope("county");
    mockNavigator({
      getCurrentPosition: vi.fn(
        (_success: PositionCallback, error: GeoErrorCallback) => {
          error({ code: 3, message: "Timeout expired", PERMISSION_DENIED: 1 });
        },
      ),
    });

    await render();
    await act(async () => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });

    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Use my location");
    expect(button?.hasAttribute("disabled")).toBe(false);
    expect(
      container.querySelector('[data-testid="today-location-blocked"]'),
    ).toBeNull();
  });
});
