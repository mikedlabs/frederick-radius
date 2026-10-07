import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEventSheetLookup, EVENT_LOOKUP_TIMEOUT_MS } from "./event-sheet-lookup";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("event sheet lookup recovery", () => {
  it("returns only the requested event and disposes its deadline", async () => {
    vi.useFakeTimers();
    const place = { slug: "brunswick-place", title: "Brunswick event" };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ event: place }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchEventSheetLookup(place.slug, new AbortController().signal)).resolves.toEqual(place);
    expect(fetchMock).toHaveBeenCalledWith("/api/events/brunswick-place/summary?v=attendance-2", { signal: expect.any(AbortSignal) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    new Response(null, { status: 503 }),
    Response.json({ event: { slug: "different-place" } }),
    Response.json({ event: null }),
  ])("returns no event for an unsuccessful or mismatched response", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(fetchEventSheetLookup("requested", new AbortController().signal)).resolves.toBeNull();
  });

  it("aborts and rejects a hung transport even when it ignores the signal", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    const result = expect(fetchEventSheetLookup("requested", new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(EVENT_LOOKUP_TIMEOUT_MS);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a stalled JSON body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const result = expect(fetchEventSheetLookup("requested", new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(EVENT_LOOKUP_TIMEOUT_MS);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels immediately when the caller closes or replaces the sheet", async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    const result = expect(fetchEventSheetLookup("requested", parent.signal)).rejects.toMatchObject({ name: "AbortError" });
    parent.abort();
    await result;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not begin a request after cancellation", async () => {
    const parent = new AbortController();
    parent.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchEventSheetLookup("requested", parent.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
