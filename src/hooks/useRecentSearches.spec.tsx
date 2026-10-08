// @vitest-environment jsdom

import { act, useEffect } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useClearRecentSearches,
  usePushRecentSearch,
  useRecentSearches,
} from "./useRecentSearches";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "fr:recent-search:v2";
const LEGACY_KEY = "fr:recent-search:v1";
let pushSearch: (query: string) => void;
let clearSearches: () => void;

function Probe() {
  const recent = useRecentSearches();
  const push = usePushRecentSearch();
  const clear = useClearRecentSearches();
  useEffect(() => {
    pushSearch = push;
    clearSearches = clear;
  }, [push, clear]);
  return <output>{JSON.stringify(recent)}</output>;
}

describe("submitted searches stored only in the current browser", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  async function mount() {
    await act(async () => root.render(<Probe />));
  }

  function recent() {
    return JSON.parse(container.querySelector("output")?.textContent ?? "null");
  }

  it("starts empty without creating a history record", async () => {
    await mount();
    expect(recent()).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("does not treat an unverifiable legacy array as this person's submitted searches", async () => {
    const legacy = JSON.stringify(["xqzvwmblorp", "Demo coffee"]);
    window.localStorage.setItem(LEGACY_KEY, legacy);
    await mount();
    expect(recent()).toEqual([]);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBe(legacy);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it.each([
    ["bare array", ["xqzvwmblorp"]],
    ["imported record", { source: "demo", queries: ["xqzvwmblorp"] }],
    ["invalid query values", { source: "submitted-on-device", queries: ["coffee", 7] }],
  ])("rejects a %s without submission provenance", async (_label, value) => {
    window.localStorage.setItem(KEY, JSON.stringify(value));
    await mount();
    expect(recent()).toEqual([]);
  });

  it("records arbitrary actual submissions without importing old entries", async () => {
    const legacy = JSON.stringify(["Demo coffee"]);
    window.localStorage.setItem(LEGACY_KEY, legacy);
    await mount();
    await act(async () => pushSearch("  xqzvwmblorp  "));
    expect(recent()).toEqual(["xqzvwmblorp"]);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({
      source: "submitted-on-device",
      queries: ["xqzvwmblorp"],
    });
    expect(window.localStorage.getItem(LEGACY_KEY)).toBe(legacy);
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    expect(recent()).toEqual(["xqzvwmblorp"]);
  });

  it("deduplicates actual submissions and keeps at most six queries", async () => {
    await mount();
    await act(async () => {
      for (const query of ["one", "two", "three", "four", "five", "six", "seven", " SIX ", " "]) {
        pushSearch(query);
      }
    });
    expect(recent()).toEqual(["SIX", "seven", "five", "four", "three", "two"]);
    await act(async () => clearSearches());
    expect(recent()).toEqual([]);
  });

  it("does not claim cached history when the current storage cannot be read", async () => {
    await mount();
    await act(async () => pushSearch("coffee"));
    expect(recent()).toEqual(["coffee"]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable", "SecurityError");
    });
    await act(async () => root.render(<Probe />));
    expect(recent()).toEqual([]);
  });

  it("updates an open list when history is removed by another tab on this device", async () => {
    await mount();
    await act(async () => pushSearch("coffee"));
    expect(recent()).toEqual(["coffee"]);
    await act(async () => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(recent()).toEqual([]);
  });

  it("lets the real search continue if the browser cannot persist history", async () => {
    await mount();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    await act(async () => {
      expect(() => pushSearch("coffee")).not.toThrow();
    });
    expect(recent()).toEqual([]);
  });

  it("renders no person's browser history in a server snapshot", async () => {
    await mount();
    await act(async () => pushSearch("coffee"));
    expect(recent()).toEqual(["coffee"]);
    expect(renderToString(<Probe />)).toContain("[]");
  });
});
