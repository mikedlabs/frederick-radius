import { afterEach, describe, expect, it, vi } from "vitest";
import { getNpsAlerts } from "./nps";

const originalNpsKey = process.env.NPS_API_KEY;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalNpsKey === undefined) delete process.env.NPS_API_KEY;
  else process.env.NPS_API_KEY = originalNpsKey;
});

describe("NPS request deadline", () => {
  it("aborts a stalled park-alert request and fails soft", async () => {
    vi.useFakeTimers();
    process.env.NPS_API_KEY = "test-key";
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }));

    const pending = getNpsAlerts();
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toEqual([]);
    expect(signal?.aborted).toBe(true);
  });
});
