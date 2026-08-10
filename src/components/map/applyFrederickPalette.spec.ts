import { readFileSync } from "node:fs";
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

// ── The map's ground must BE the app's paper ────────────────────────────
// Source-text contract, not a render test: Mapbox paint props cannot read
// CSS variables, so these hexes are copied by hand and drift silently. They
// had: the ground sat at #F2EFE8 under an app paper of #F4EEE2, a cooler
// cream that never quite matched the chrome on top of it. Nothing failed,
// it just looked slightly not-ours forever.
describe("palette parity with the shipped brand tokens", () => {
  const paletteSource = readFileSync(
    new URL("./applyFrederickPalette.ts", import.meta.url),
    "utf8",
  );
  const globals = readFileSync(
    new URL("../../app/globals.css", import.meta.url),
    "utf8",
  );

  const constant = (name: string) =>
    paletteSource
      .match(new RegExp(`^const ${name} = "(#[0-9A-Fa-f]{6})"`, "m"))?.[1]
      ?.toUpperCase() ?? null;

  const token = (name: string) =>
    globals
      .match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]
      ?.toUpperCase() ?? null;

  it.each([
    ["PAPER", "app-paper"],
    ["PAPER_2", "app-paper-2"],
    ["HALO", "app-paper"],
    ["LABEL", "app-ink"],
    ["LABEL_2", "app-ink-2"],
  ])("%s equals var(--%s)", (constantName, tokenName) => {
    const value = constant(constantName);
    expect(value, `${constantName} not found in the palette source`).toBeTruthy();
    expect(value).toBe(token(tokenName));
  });
});
