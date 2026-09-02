// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAIR_CAR_STORAGE_KEY,
  FAIR_CAR_TTL_MS,
  createSavedFairCar,
} from "@/lib/fair/car-memory";

import FairCarMemoryPanel from "./FairCarMemoryPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function position(
  latitude: number,
  longitude: number,
  accuracy: number,
): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

describe("FairCarMemoryPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  let storedValues: Map<string, string>;
  let getCurrentPosition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T16:00:00Z"));
    storedValues = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) =>
          void storedValues.set(key, value),
        removeItem: (key: string) => void storedValues.delete(key),
      },
    });
    getCurrentPosition = vi.fn();
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  async function renderPanel() {
    await act(async () => {
      root.render(createElement(FairCarMemoryPanel));
    });
  }

  function button(label: string): HTMLButtonElement {
    const match = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes(label),
    );
    if (!match) throw new Error(`Missing ${label} button.`);
    return match;
  }

  it("does not request location before the visitor taps a location action", async () => {
    await renderPanel();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Radius never sends this location, lot, or note",
    );
  });

  it("stores a good car point locally and calculates return guidance locally", async () => {
    getCurrentPosition
      .mockImplementationOnce((success: PositionCallback) =>
        success(position(39.4105, -77.3865, 18)),
      )
      .mockImplementationOnce((success: PositionCallback) =>
        success(position(39.4115, -77.3865, 16)),
      );
    await renderPanel();

    await act(async () => button("Save my location").click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    const stored = JSON.parse(storedValues.get(FAIR_CAR_STORAGE_KEY) ?? "{}");
    expect(stored.latitude).toBe(39.4105);
    expect(stored.longitude).toBe(-77.3865);
    expect(container.textContent).toContain("saved only on this device");
    expect(document.activeElement?.getAttribute("role")).toBe("status");

    await act(async () => button("Where is my car from here?").click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(container.textContent).toContain("About");
    expect(container.textContent).toContain("south");
    expect(container.textContent).toContain("straight-line direction");
    expect(document.activeElement?.textContent).toContain("south");
    expect(document.activeElement?.textContent).toContain(
      "straight-line direction",
    );
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("requires confirmation before storing a weak GPS point", async () => {
    getCurrentPosition.mockImplementationOnce((success: PositionCallback) =>
      success(position(39.4105, -77.3865, 145)),
    );
    await renderPanel();

    await act(async () => button("Save my location").click());
    expect(storedValues.has(FAIR_CAR_STORAGE_KEY)).toBe(false);
    expect(container.textContent).toContain("GPS point may be too broad");

    await act(async () => button("Save approximate spot").click());
    expect(storedValues.has(FAIR_CAR_STORAGE_KEY)).toBe(true);
  });

  it("can save and delete a lot-only fallback", async () => {
    await renderPanel();
    await act(async () => button("Save lot and note only").click());
    expect(storedValues.has(FAIR_CAR_STORAGE_KEY)).toBe(true);

    await act(async () => button("Delete saved spot").click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(storedValues.has(FAIR_CAR_STORAGE_KEY)).toBe(false);
    expect(container.textContent).toContain("removed from this device");
    expect(document.activeElement?.id).toBe("fair-car-memory");
  });

  it("removes a saved parking spot when its 18-hour window expires", async () => {
    const saved = createSavedFairCar(
      {
        lotId: "lot-d",
        lotLabel: "Lot D",
        latitude: 39.4105,
        longitude: -77.3865,
        accuracyMeters: 18,
      },
      new Date("2026-09-20T16:00:00Z"),
    );
    storedValues.set(FAIR_CAR_STORAGE_KEY, JSON.stringify(saved));

    await renderPanel();
    expect(container.textContent).toContain("Lot D");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FAIR_CAR_TTL_MS);
    });

    expect(storedValues.has(FAIR_CAR_STORAGE_KEY)).toBe(false);
    expect(container.textContent).toContain(
      "The saved parking spot expired and was removed from this device.",
    );
    expect(container.textContent).toContain("Save lot and note only");
  });

  it("removes an already-expired parking entry on mount", async () => {
    const saved = createSavedFairCar(
      { lotId: "lot-a", lotLabel: "Lot A" },
      new Date("2026-09-19T16:00:00Z"),
    );
    storedValues.set(FAIR_CAR_STORAGE_KEY, JSON.stringify(saved));

    await renderPanel();

    expect(storedValues.has(FAIR_CAR_STORAGE_KEY)).toBe(false);
    expect(container.textContent).toContain("Save lot and note only");
  });
});
