// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayScopeStatus from "./TodayScopeStatus";
import { getScope, NEAR_ME_BENEFIT, setScope } from "@/lib/scope";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

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

const grantedFix = vi.fn((success: PositionCallback) => {
  success({
    coords: { longitude: -77.4105, latitude: 39.4143, accuracy: 18 },
  } as GeolocationPosition);
});

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
    window.history.replaceState(null, "", "/today");
    grantedFix.mockClear();
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

  const select = () => container.querySelector("select")!;
  const choose = async (value: string) => {
    await act(async () => {
      select().value = value;
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  // Chrome and Edge on Windows, Linux and ChromeOS, and NVDA or JAWS in focus
  // mode, move a closed select one option per arrow key and fire change on
  // each step, starting from whatever option the select shows after React
  // restores its controlled value.
  const arrow = async (step: 1 | -1) => {
    await act(async () => {
      select().selectedIndex += step;
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const readout = () =>
    container.querySelector('[data-testid="today-scope-status"]')?.textContent;
  const benefit = () =>
    container.querySelector('[data-testid="today-location-benefit"]');
  const locationButton = () =>
    [...container.querySelectorAll("button")].find((button) =>
      /Use my location|Finding you/.test(button.textContent ?? ""),
    ) ?? null;

  it("uses an explicit county URL over a saved town and carries a later town change into links", async () => {
    setScope("town:brunswick");
    window.history.replaceState(null, "", "/today?in=county&intent=dinner#find-radius");
    mockNavigator({});
    await render();
    expect(getScope()).toBe("county");
    expect(select().value).toBe("county");
    expect(container.textContent).toContain("Countywide briefing");

    await choose("town:brunswick");
    expect(getScope()).toBe("town:brunswick");
    expect(select().value).toBe("town:brunswick");
    expect(window.location.search).toBe("?in=brunswick&intent=dinner");
    expect(window.location.hash).toBe("#find-radius");
  });

  it("lists Near me between the county and the towns and shows no location button by default", async () => {
    setScope("county");
    const { query, getCurrentPosition } = mockNavigator({
      permissionState: "granted",
    });

    await render();

    const values = [...select().options].map((option) => option.value);
    expect(values[0]).toBe("county");
    expect(values[1]).toBe("nearme");
    expect(values.slice(2).every((value) => value.startsWith("town:"))).toBe(true);
    // County and town lenses never check or request location.
    expect(query).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(locationButton()).toBeNull();
    expect(benefit()).toBeNull();
  });

  it("silently refreshes an already-granted fix when the lens is Near me", async () => {
    setScope("nearme");
    const { query, getCurrentPosition } = mockNavigator({
      permissionState: "granted",
      getCurrentPosition: grantedFix,
    });

    await render();

    expect(query).toHaveBeenCalledWith({ name: "geolocation" });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    // With the fix restored the row offers no location action.
    expect(locationButton()).toBeNull();
    expect(select().value).toBe("nearme");
    expect(container.textContent).toContain("Nearby place picks");
  });

  it("explains location when Near me is chosen and asks only from the button", async () => {
    setScope("county");
    let benefitWhenAsked: string | null | undefined;
    const { getCurrentPosition } = mockNavigator({
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        // Capture what was on screen at the moment the browser would ask.
        benefitWhenAsked = benefit()?.textContent;
        success({
          coords: { longitude: -77.4105, latitude: 39.4143, accuracy: 18 },
        } as GeolocationPosition);
      }),
    });

    await render();
    expect(benefit()).toBeNull();

    // Choosing Near me explains and never prompts. The select shows the
    // choice, but the county stays in effect and the readout still says so.
    await choose("nearme");
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(getScope()).toBe("county");
    expect(readout()).toBe("Countywide briefing");
    expect(select().value).toBe("nearme");
    expect(benefit()?.textContent).toBe(NEAR_ME_BENEFIT);
    const button = locationButton()!;
    expect(button.textContent).toBe("Use my location");
    expect(button.getAttribute("aria-describedby")).toBe(benefit()?.id);

    // The button is the one control that can open the browser prompt.
    await act(async () => button.click());

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(benefitWhenAsked).toBe(NEAR_ME_BENEFIT);
    // A grant applies Near me through the same path as every other area.
    expect(getScope()).toBe("nearme");
    expect(select().value).toBe("nearme");
    expect(window.location.search).toBe("?in=nearme");
    expect(benefit()).toBeNull();
    expect(locationButton()).toBeNull();
  });

  it("applies Near me at once when this device already has a fix", async () => {
    setScope("county");
    const { getCurrentPosition } = mockNavigator({ getCurrentPosition: grantedFix });
    window.sessionStorage.setItem(
      "fr_geo_v1",
      JSON.stringify({ lng: -77.4105, lat: 39.4143, accuracy: 18, timestamp: Date.now() }),
    );

    await render();
    await choose("nearme");

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(getScope()).toBe("nearme");
    expect(benefit()).toBeNull();
  });

  it("drops the explanation when another area is chosen instead", async () => {
    setScope("county");
    mockNavigator({});
    await render();

    await choose("nearme");
    expect(benefit()).not.toBeNull();
    await choose("town:brunswick");
    expect(benefit()).toBeNull();
    expect(getScope()).toBe("town:brunswick");
  });

  it("lets change events step from the county past Near me to a town", async () => {
    setScope("county");
    const { getCurrentPosition } = mockNavigator({});
    await render();

    await choose("nearme");
    expect(select().value).toBe("nearme");
    expect(getScope()).toBe("county");
    await choose("town:brunswick");

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(getScope()).toBe("town:brunswick");
    expect(select().value).toBe("town:brunswick");
    expect(readout()).toBe("Brunswick place picks · Countywide weather and events");
    expect(benefit()).toBeNull();
  });

  it("keeps arrow keys moving through Near me in both directions", async () => {
    setScope("county");
    const { getCurrentPosition } = mockNavigator({});
    await render();
    const towns = [...select().options].slice(2).map((option) => option.value);

    // ArrowDown from the county lands on Near me, which explains location
    // without applying it, and the next ArrowDown reaches the first town.
    await arrow(1);
    expect(select().value).toBe("nearme");
    expect(getScope()).toBe("county");
    expect(benefit()).not.toBeNull();
    await arrow(1);
    expect(getScope()).toBe(towns[0]);
    expect(select().value).toBe(towns[0]);
    await arrow(1);
    expect(getScope()).toBe(towns[1]);

    // ArrowUp from the first town crosses Near me back to the county.
    await arrow(-1);
    await arrow(-1);
    expect(select().value).toBe("nearme");
    expect(getScope()).toBe(towns[0]);
    await arrow(-1);
    expect(getScope()).toBe("county");
    expect(select().value).toBe("county");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("shows the area in effect again once focus leaves the line", async () => {
    setScope("county");
    mockNavigator({});
    const outside = document.createElement("button");
    document.body.append(outside);
    await render();

    await act(async () => select().focus());
    await choose("nearme");
    expect(select().value).toBe("nearme");

    // Tabbing on to the location button keeps the choice it would finish.
    await act(async () => locationButton()!.focus());
    expect(select().value).toBe("nearme");

    await act(async () => outside.focus());
    expect(select().value).toBe("county");
    expect(getScope()).toBe("county");
    // The explanation and its button stay, so the choice can still be made.
    expect(benefit()?.textContent).toBe(NEAR_ME_BENEFIT);
    expect(locationButton()).not.toBeNull();
    outside.remove();
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
    await choose("nearme");
    await act(async () => locationButton()!.click());

    expect(locationButton()).toBeNull();
    expect(
      container.querySelector('[data-testid="today-location-blocked"]')
        ?.textContent,
    ).toBe("Location is off. Choose a town to keep browsing.");
    // A refusal cannot be re-prompted, so the "may ask" sentence goes too,
    // and the select shows the area that is still in effect.
    expect(benefit()).toBeNull();
    expect(getScope()).toBe("county");
    expect(select().value).toBe("county");
    expect(readout()).toBe("Countywide briefing");

    // With location off, Near me still lets the arrow keys pass through it.
    await arrow(1);
    expect(select().value).toBe("nearme");
    expect(getScope()).toBe("county");
    await choose("town:brunswick");
    expect(getScope()).toBe("town:brunswick");
    expect(container.textContent).toContain("Brunswick place picks");
    expect(
      container.querySelector('[data-testid="today-location-blocked"]'),
    ).toBeNull();
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
    await choose("nearme");
    await act(async () => locationButton()!.click());

    const button = locationButton();
    expect(button?.textContent).toBe("Use my location");
    expect(button?.hasAttribute("disabled")).toBe(false);
    expect(
      container.querySelector('[data-testid="today-location-blocked"]'),
    ).toBeNull();
  });
});
