import { afterEach, describe, expect, it, vi } from "vitest";
import { withDeadlineFallback } from "./promise-deadline";

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
