import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLiveEventsForSources } from "./ical-live";
import { publicEventSourceCircuits } from "./event-source-circuit";

describe("county event health probe", () => {
  beforeEach(() => {
    publicEventSourceCircuits.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T18:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the full source deadline for an isolated health probe", async () => {
    let sourceSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((_input, init) => {
        sourceSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          const rejectAbort = () =>
            reject(new DOMException("Aborted", "AbortError"));
          if (sourceSignal?.aborted) rejectAbort();
          else sourceSignal?.addEventListener("abort", rejectAbort, {
            once: true,
          });
        });
      }),
    );

    const controller = new AbortController();
    const pending = getLiveEventsForSources(["county"], 60, {
      signal: controller.signal,
      readMode: "probe",
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(sourceSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(sourceSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(sourceSignal?.aborted).toBe(true);
    await expect(pending).resolves.toMatchObject({
      sources_succeeded: [],
      sources_failed: ["county"],
    });
  });

  it("keeps the shorter county deadline for a public request", async () => {
    let sourceSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((_input, init) => {
        sourceSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          const rejectAbort = () =>
            reject(new DOMException("Aborted", "AbortError"));
          if (sourceSignal?.aborted) rejectAbort();
          else sourceSignal?.addEventListener("abort", rejectAbort, {
            once: true,
          });
        });
      }),
    );

    const controller = new AbortController();
    const pending = getLiveEventsForSources(["county"], 60, {
      signal: controller.signal,
      readMode: "public",
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(sourceSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(sourceSignal?.aborted).toBe(true);
    await expect(pending).resolves.toMatchObject({
      sources_succeeded: [],
      sources_failed: ["county"],
    });
  });
});
