import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAbortDeadline,
  withDeadlineFallback,
  withDeadlineOutcome,
} from "./promise-deadline";

afterEach(() => {
  vi.useRealTimers();
});

describe("withDeadlineFallback", () => {
  it("keeps fast results", async () => {
    await expect(withDeadlineFallback(Promise.resolve(["live"]), 100, ["fallback"]))
      .resolves.toEqual(["live"]);
  });

  it("returns the fallback when optional work does not settle", async () => {
    vi.useFakeTimers();
    const pending = withDeadlineFallback(
      new Promise<string[]>(() => undefined),
      1_200,
      [],
    );
    await vi.advanceTimersByTimeAsync(1_200);
    await expect(pending).resolves.toEqual([]);
  });
});

describe("withDeadlineOutcome", () => {
  it("keeps fulfillment, rejection, and timeout distinct", async () => {
    await expect(
      withDeadlineOutcome(Promise.resolve("done"), 100),
    ).resolves.toEqual({ status: "fulfilled", value: "done" });
    await expect(
      withDeadlineOutcome(Promise.reject(new Error("hidden")), 100),
    ).resolves.toEqual({ status: "rejected" });

    vi.useFakeTimers();
    const pending = withDeadlineOutcome(new Promise<string>(() => undefined), 25);
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toEqual({ status: "timed_out" });
    vi.useRealTimers();
  });
});

describe("createAbortDeadline", () => {
  it("aborts at its own deadline and composes an earlier parent abort", async () => {
    vi.useFakeTimers();

    const timed = createAbortDeadline(50);
    expect(timed.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(timed.signal.aborted).toBe(true);
    timed.dispose();

    const parent = new AbortController();
    const composed = createAbortDeadline(5_000, parent.signal);
    parent.abort();
    expect(composed.signal.aborted).toBe(true);
    composed.dispose();
  });

  it("disposes a fast operation without aborting it later", async () => {
    vi.useFakeTimers();

    const deadline = createAbortDeadline(50);
    deadline.dispose();
    await vi.advanceTimersByTimeAsync(50);

    expect(deadline.signal.aborted).toBe(false);
  });
});
