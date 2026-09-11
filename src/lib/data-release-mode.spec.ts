import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installPromotedBuildFetchGuard,
  isPromotedDataBuild,
} from "./data-release-mode";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(
    globalThis,
    Symbol.for("frederick-radius.promoted-data-build"),
  );
  Reflect.deleteProperty(
    process,
    Symbol.for("frederick-radius.promoted-data-build"),
  );
});

describe("promoted data build mode", () => {
  it("is explicit and disabled for ordinary runtime requests", () => {
    expect(isPromotedDataBuild({})).toBe(false);
    expect(isPromotedDataBuild({ RADIUS_DATA_MODE: "runtime" })).toBe(false);
    expect(isPromotedDataBuild({ RADIUS_DATA_MODE: "promoted" })).toBe(true);
  });

  it("inherits promoted mode through a build-worker process marker", () => {
    Object.defineProperty(
      globalThis,
      Symbol.for("frederick-radius.promoted-data-build"),
      { value: true, configurable: true },
    );

    expect(isPromotedDataBuild()).toBe(true);
    // Explicit dependency injection remains isolated from global process state.
    expect(isPromotedDataBuild({})).toBe(false);
  });

  it("recognizes the preloaded fetch guard across a prerender VM boundary", () => {
    const guardedFetch = vi.fn() as unknown as typeof fetch & {
      __radiusPromotedBuildFetchGuard?: true;
    };
    Object.defineProperty(guardedFetch, "__radiusPromotedBuildFetchGuard", {
      value: true,
    });
    vi.stubGlobal("fetch", guardedFetch);

    expect(isPromotedDataBuild()).toBe(true);
    // Explicit dependency injection remains isolated from process markers.
    expect(isPromotedDataBuild({})).toBe(false);
  });

  it("recognizes the process marker inherited by a prerender worker", () => {
    Object.defineProperty(
      process,
      Symbol.for("frederick-radius.promoted-data-build"),
      { value: true, configurable: true },
    );

    expect(isPromotedDataBuild()).toBe(true);
    expect(isPromotedDataBuild({})).toBe(false);
  });

  it("blocks build-time fetches without exposing query secrets", async () => {
    vi.stubEnv("RADIUS_DATA_MODE", "promoted");
    const liveFetch = vi.fn();
    vi.stubGlobal("fetch", liveFetch);

    installPromotedBuildFetchGuard();

    await expect(
      fetch("https://publisher.example/events?api_key=secret"),
    ).rejects.toThrow(
      "Live fetch blocked during promoted-data build: https://publisher.example/events",
    );
    expect(liveFetch).not.toHaveBeenCalled();
  });

  it("leaves runtime fetch untouched", () => {
    vi.stubEnv("RADIUS_DATA_MODE", "runtime");
    const liveFetch = vi.fn();
    vi.stubGlobal("fetch", liveFetch);

    installPromotedBuildFetchGuard();

    expect(globalThis.fetch).toBe(liveFetch);
  });
});
