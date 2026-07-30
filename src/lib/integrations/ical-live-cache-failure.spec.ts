import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cacheState = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    <Args extends unknown[], Value>(
      work: (...args: Args) => Promise<Value>,
      keyParts: string[] = [],
    ) =>
    async (...args: Args): Promise<Value> => {
      const key = JSON.stringify([keyParts, args]);
      if (cacheState.values.has(key)) {
        return cacheState.values.get(key) as Value;
      }
      const value = await work(...args);
      cacheState.values.set(key, value);
      return value;
    },
}));

import { getCachedLiveEventsForSources } from "./ical-live";
import { publicEventSourceCircuits } from "./event-source-circuit";

describe("cached live-event source failures", () => {
  beforeEach(() => {
    cacheState.values.clear();
    publicEventSourceCircuits.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("serves a cached failed source state instead of making each visitor probe it", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("provider unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getCachedLiveEventsForSources(
      ["celebrate"],
      60,
    );
    expect(first).toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["celebrate"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The short in-process assembly memo is now expired. A second page reader
    // still receives the durable per-source failed page and does not probe the
    // upstream again.
    await vi.advanceTimersByTimeAsync(31_000);
    const second = await getCachedLiveEventsForSources(
      ["celebrate"],
      60,
    );

    expect(second).toMatchObject({
      events: [],
      sources_succeeded: [],
      sources_failed: ["celebrate"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
