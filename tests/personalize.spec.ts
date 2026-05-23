import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHomeMuni,
  setHomeMuni,
  getInterests,
  setInterests,
  hasOnboardingPrefs,
} from "../src/lib/personalize";

/**
 * personalize is the persistence layer for Phase D onboarding picks.
 * Two device-local prefs, both nullable / optional, both used as soft
 * biases by Today + Radius + Search + Settings. The contract these
 * tests pin down:
 *
 *   - get* returns the canonical default (null / []) when storage is
 *     empty, corrupt, or has the wrong shape — never throws.
 *   - set* persists, round-trips via get*, and treats "" / [] as a
 *     clear (key gets removed so storage stays clean).
 *   - hasOnboardingPrefs flips true the moment EITHER pref is set.
 *
 * We stub localStorage on the global so the lib's `window.localStorage`
 * lookup resolves to a real-enough mock without needing jsdom.
 */

class FakeStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

beforeEach(() => {
  const ls = new FakeStorage();
  vi.stubGlobal("window", { localStorage: ls });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("home muni", () => {
  it("returns null when nothing is stored", () => {
    expect(getHomeMuni()).toBeNull();
  });
  it("round-trips a set value", () => {
    setHomeMuni("brunswick");
    expect(getHomeMuni()).toBe("brunswick");
  });
  it("treats setHomeMuni(null) as a clear", () => {
    setHomeMuni("brunswick");
    setHomeMuni(null);
    expect(getHomeMuni()).toBeNull();
  });
  it('treats setHomeMuni("") as a clear', () => {
    setHomeMuni("brunswick");
    setHomeMuni("");
    expect(getHomeMuni()).toBeNull();
  });
});

describe("interests", () => {
  it("returns [] when nothing is stored", () => {
    expect(getInterests()).toEqual([]);
  });
  it("round-trips a set value, preserving order", () => {
    setInterests(["food", "outdoors", "arts"]);
    expect(getInterests()).toEqual(["food", "outdoors", "arts"]);
  });
  it("de-duplicates and strips non-strings on write", () => {
    // Cast away type to simulate a corrupted call site.
    setInterests([
      "food",
      "food",
      "outdoors",
      // @ts-expect-error — intentional bad input
      42,
    ]);
    expect(getInterests()).toEqual(["food", "outdoors"]);
  });
  it("treats setInterests([]) as a clear", () => {
    setInterests(["food"]);
    setInterests([]);
    expect(getInterests()).toEqual([]);
  });
  it("survives a garbled localStorage value (returns [])", () => {
    (window.localStorage as unknown as FakeStorage).setItem(
      "fr:interests:v1",
      "not-json{",
    );
    expect(getInterests()).toEqual([]);
  });
  it("ignores a JSON value that isn't an array (returns [])", () => {
    (window.localStorage as unknown as FakeStorage).setItem(
      "fr:interests:v1",
      JSON.stringify({ food: true }),
    );
    expect(getInterests()).toEqual([]);
  });
});

describe("hasOnboardingPrefs", () => {
  it("is false on a fresh device", () => {
    expect(hasOnboardingPrefs()).toBe(false);
  });
  it("flips true when a home muni is set", () => {
    setHomeMuni("brunswick");
    expect(hasOnboardingPrefs()).toBe(true);
  });
  it("flips true when interests are set", () => {
    setInterests(["food"]);
    expect(hasOnboardingPrefs()).toBe(true);
  });
  it("goes back to false when both are cleared", () => {
    setHomeMuni("brunswick");
    setInterests(["food"]);
    setHomeMuni(null);
    setInterests([]);
    expect(hasOnboardingPrefs()).toBe(false);
  });
});
