import { describe, it, expect, vi, afterEach } from "vitest";
import { getLiveEvents } from "@/lib/integrations/ical-live";

/**
 * PR1 — events cold-load hardening. The /events render awaits the live
 * feeds in parallel, so a failing or hung upstream must degrade to []
 * (the page then renders from seed + curated data), never throw and
 * never block the render indefinitely.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getLiveEvents — feed failures never block or break the page", () => {
  it("a rejecting feed degrades to an empty, valid result (no throw)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    const res = await getLiveEvents(60);
    expect(Array.isArray(res.events)).toBe(true);
    expect(res.events).toEqual([]);
  });

  it("a hung feed is aborted by the timeout instead of hanging forever", async () => {
    // fetch never resolves on its own — it only settles when the
    // AbortController fires, which is exactly the timeout path.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      ),
    );
    vi.useFakeTimers();
    const p = getLiveEvents(60);
    // Advance past FEED_FETCH_TIMEOUT_MS (8s) so every feed's abort fires.
    await vi.advanceTimersByTimeAsync(9_000);
    const res = await p;
    expect(res.events).toEqual([]);
  });
});
