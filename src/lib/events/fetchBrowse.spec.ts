import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENTS_BROWSE_TIMEOUT_MS, fetchEventsBrowse } from "./fetchBrowse";

const request = {
  url: "/api/events/browse?refresh=1",
  init: { cache: "no-store" as const, headers: { Accept: "application/json" } },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bounded event browse reads", () => {
  it("returns the payload and preserves the explicit refresh request", async () => {
    vi.useFakeTimers();
    const payload = { events: [], sourceHealth: { degraded: false } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEventsBrowse(request)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(request.url, {
      ...request.init,
      signal: expect.any(AbortSignal),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases a hung request even when transport ignores abort", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));

    const result = expect(fetchEventsBrowse(request)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(EVENTS_BROWSE_TIMEOUT_MS);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a stalled body after successful response headers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise(() => {}),
    }));

    const result = expect(fetchEventsBrowse(request)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(EVENTS_BROWSE_TIMEOUT_MS);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects unsuccessful responses promptly and clears the deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(fetchEventsBrowse(request)).rejects.toThrow("503");
    expect(vi.getTimerCount()).toBe(0);
  });
});
