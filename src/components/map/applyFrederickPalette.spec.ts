import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyFrederickPalette } from "./applyFrederickPalette";

// Count complete palette passes via the "fr-palette" performance.measure the
// function fires at the end of each apply() — robust vs internal getStyle calls.
let applyCount = 0;
beforeEach(() => {
  applyCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).performance = {
    mark: vi.fn(),
    measure: vi.fn((name: string) => {
      if (name === "fr-palette") applyCount++;
    }),
  };
});

function makeMap(opts: { loaded: boolean }) {
  const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
  return {
    _fire: (ev: string) => (listeners[ev] ?? []).forEach((f) => f()),
    _hasListener: (ev: string) => (listeners[ev] ?? []).length,
    isStyleLoaded: () => opts.loaded,
    getStyle: () => ({ layers: [{ id: "water", type: "fill" }, { id: "road-primary", type: "line" }] }),
    setPaintProperty: () => {},
    setLayoutProperty: () => {},
    addLayer: () => {},
    getLayer: () => undefined,
    getSource: () => undefined,
    addSource: () => {},
    once: (ev: string, cb: (...a: unknown[]) => void) => {
      (listeners[ev] ??= []).push(cb);
    },
    on: (ev: string, cb: (...a: unknown[]) => void) => {
      (listeners[ev] ??= []).push(cb);
    },
    off: (ev: string, cb: (...a: unknown[]) => void) => {
      listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== cb);
    },
  };
}

describe("applyFrederickPalette", () => {
  it("applies exactly once immediately when the style is already loaded", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = makeMap({ loaded: true }) as any;
    applyFrederickPalette(map);
    expect(applyCount).toBe(1);
    // No standing style.load listener — that double-repainted on navigation.
    expect(map._hasListener("style.load")).toBe(0);
  });

  it("defers to a single style.load pass when not yet loaded, then applies once", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = makeMap({ loaded: false }) as any;
    applyFrederickPalette(map);
    expect(applyCount).toBe(0);
    expect(map._hasListener("style.load")).toBe(1);
    map._fire("style.load");
    expect(applyCount).toBe(1);
  });

  it("the disposer removes the pending listener (unmount before load)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = makeMap({ loaded: false }) as any;
    const dispose = applyFrederickPalette(map);
    dispose();
    map._fire("style.load");
    expect(applyCount).toBe(0);
  });
});
