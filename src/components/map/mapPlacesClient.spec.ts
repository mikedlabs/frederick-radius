import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadMapPlaces,
  MAP_PLACES_REQUEST_TIMEOUT_MS,
  resetMapPlacesRequest,
  warmMapPlaces,
} from "./mapPlacesClient";

const validPayload = {
  generatedAt: "2026-08-11T16:00:00.000Z",
  places: [
    {
      slug: "gravel-and-grind-frederick",
      name: "Gravel & Grind",
      category: "coffee",
      geom: { lng: -77.4108, lat: 39.4143 },
      open_status: { state: "unknown" },
    },
  ],
};

afterEach(() => {
  resetMapPlacesRequest();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("mapPlacesClient", () => {
  it("deduplicates warmup and consumer requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    warmMapPlaces();
    const payload = await loadMapPlaces();

    expect(payload.places[0]?.slug).toBe("gravel-and-grind-frederick");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(loadMapPlaces()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears a failed request so retry can recover", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validPayload), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadMapPlaces()).rejects.toThrow("returned 503");
    await expect(loadMapPlaces()).resolves.toMatchObject(validPayload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed rows rather than drawing bad coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            generatedAt: validPayload.generatedAt,
            places: [{ slug: "bad", name: "Bad", geom: { lng: null, lat: 1 } }],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(loadMapPlaces()).rejects.toThrow("malformed");
  });

  it("bounds stalled headers at ten seconds and allows a deliberate retry", async () => {
    vi.useFakeTimers();
    const headers = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>()
      .mockReturnValueOnce(headers.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify(validPayload)));
    vi.stubGlobal("fetch", fetchMock);
    const request = loadMapPlaces();
    const settled = vi.fn();
    void request.then(settled, settled);
    expect(MAP_PLACES_REQUEST_TIMEOUT_MS).toBe(10_000);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(settled).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    const retry = loadMapPlaces();
    await expect(retry).resolves.toEqual(validPayload);
    headers.reject(new Error("retired transport failed late"));
    await vi.advanceTimersByTimeAsync(0);
    expect(loadMapPlaces()).toBe(retry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a stalled JSON body even when it ignores abort", async () => {
    vi.useFakeTimers();
    const body = deferred<unknown>();
    const response = new Response("{}");
    vi.spyOn(response, "json").mockReturnValue(body.promise);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(new Response(JSON.stringify(validPayload)));
    vi.stubGlobal("fetch", fetchMock);
    const request = loadMapPlaces();
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    const retry = loadMapPlaces();
    await expect(retry).resolves.toEqual(validPayload);
    body.resolve({ generatedAt: "old", places: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(loadMapPlaces()).toBe(retry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reset cancels only the retired flight and an old failure cannot evict its successor", async () => {
    vi.useFakeTimers();
    const oldHeaders = deferred<Response>();
    const newHeaders = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>()
      .mockReturnValueOnce(oldHeaders.promise)
      .mockReturnValueOnce(newHeaders.promise);
    vi.stubGlobal("fetch", fetchMock);
    warmMapPlaces();
    const original = loadMapPlaces();
    const originalRejected = expect(original).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    const oldSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    resetMapPlacesRequest();
    const replacement = loadMapPlaces();
    await vi.advanceTimersByTimeAsync(0);
    await originalRejected;
    expect(oldSignal?.aborted).toBe(true);
    expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
    oldHeaders.reject(new Error("old request rejected after reset"));
    await vi.advanceTimersByTimeAsync(0);
    expect(loadMapPlaces()).toBe(replacement);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    newHeaders.resolve(new Response(JSON.stringify(validPayload)));
    await expect(replacement).resolves.toEqual(validPayload);
    expect(loadMapPlaces()).toBe(replacement);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a reset during JSON parsing cannot let late old rows replace the recovered snapshot", async () => {
    vi.useFakeTimers();
    const oldBody = deferred<unknown>();
    const response = new Response("{}");
    const readOldBody = vi.spyOn(response, "json").mockReturnValue(oldBody.promise);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(new Response(JSON.stringify(validPayload)));
    vi.stubGlobal("fetch", fetchMock);
    const original = loadMapPlaces();
    const originalRejected = expect(original).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    expect(readOldBody).toHaveBeenCalledOnce();
    resetMapPlacesRequest();
    const replacement = loadMapPlaces();
    await originalRejected;
    await expect(replacement).resolves.toEqual(validPayload);
    oldBody.resolve({ generatedAt: "retired", places: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(loadMapPlaces()).toBe(replacement);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a successfully loaded empty snapshot shared until an explicit reset", async () => {
    vi.useFakeTimers();
    const empty = { generatedAt: validPayload.generatedAt, places: [] };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(empty)))
      .mockResolvedValueOnce(new Response(JSON.stringify(validPayload)));
    vi.stubGlobal("fetch", fetchMock);
    const first = loadMapPlaces();
    await expect(first).resolves.toEqual(empty);
    expect(loadMapPlaces()).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    resetMapPlacesRequest();
    await expect(loadMapPlaces()).resolves.toEqual(validPayload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
