import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlaceSheetLookup, PLACE_LOOKUP_TIMEOUT_MS } from "./place-sheet-lookup";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("place sheet lookup recovery", () => {
  it("returns only the requested place and disposes its deadline", async () => {
    vi.useFakeTimers();
    const place = { slug: "brunswick-place", name: "Brunswick place" };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ places: [{ slug: "other" }, place] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPlaceSheetLookup(place.slug, new AbortController().signal)).resolves.toEqual(place);
    expect(fetchMock).toHaveBeenCalledWith("/api/places/by-slugs?slugs=brunswick-place", { signal: expect.any(AbortSignal) });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    new Response(null, { status: 503 }),
    Response.json({ places: [{ slug: "different-place" }] }),
    Response.json({ places: null }),
  ])("returns no place for an unsuccessful or mismatched response", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(fetchPlaceSheetLookup("requested", new AbortController().signal)).resolves.toBeNull();
  });

  it("aborts and rejects a hung transport even when it ignores the signal", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    const result = expect(fetchPlaceSheetLookup("requested", new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(PLACE_LOOKUP_TIMEOUT_MS);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a stalled JSON body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const result = expect(fetchPlaceSheetLookup("requested", new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(PLACE_LOOKUP_TIMEOUT_MS);
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
    const result = expect(fetchPlaceSheetLookup("requested", parent.signal)).rejects.toMatchObject({ name: "AbortError" });
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
    await expect(fetchPlaceSheetLookup("requested", parent.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
