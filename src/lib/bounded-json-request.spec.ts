import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startBoundedJsonRequest } from "./bounded-json-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("full-response JSON deadlines", () => {
  it("bounds ignored header aborts and consumes a later network rejection", async () => {
    const headers = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(headers.promise);
    vi.stubGlobal("fetch", fetcher);
    const task = startBoundedJsonRequest("/api/test", {}, { deadlineMs: 1_000, label: "Test" });
    const result = expect(task.promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    headers.reject(new Error("late transport failure"));
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one deadline across headers and an indefinitely stalled JSON body", async () => {
    const headers = deferred<Response>();
    const body = deferred<unknown>();
    const json = vi.fn().mockReturnValue(body.promise);
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(headers.promise));
    const task = startBoundedJsonRequest("/api/test", {}, { deadlineMs: 1_000, label: "Test" });
    const result = expect(task.promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(800);
    headers.resolve({ ok: true, json } as unknown as Response);
    await vi.advanceTimersByTimeAsync(0);
    expect(json).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await result;
    body.resolve({ tooLate: true });
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels late headers without starting their body parsing", async () => {
    const headers = deferred<Response>();
    const json = vi.fn().mockResolvedValue({ tooLate: true });
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(headers.promise));
    const task = startBoundedJsonRequest("/api/test", {}, { deadlineMs: 1_000, label: "Test" });
    const result = expect(task.promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    headers.resolve({ ok: true, json, body: { cancel } } as unknown as Response);
    await vi.advanceTimersByTimeAsync(0);
    expect(json).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels one owned flight without cancelling a separate request", async () => {
    const secondHeaders = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(new Promise(() => {})).mockReturnValueOnce(secondHeaders.promise);
    vi.stubGlobal("fetch", fetcher);
    const first = startBoundedJsonRequest("/api/one", {}, { deadlineMs: 1_000, label: "One" });
    const second = startBoundedJsonRequest("/api/two", {}, { deadlineMs: 1_000, label: "Two" });
    const result = expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    first.cancel();
    await result;
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(false);
    secondHeaders.resolve(new Response('{"ok":true}', { status: 200 }));
    await expect(second.promise).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves a non-success HTTP status and disposes its timer", async () => {
    const cancel = vi.fn();
    const endlessBody = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([120])); },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(endlessBody, { status: 503 })));
    const task = startBoundedJsonRequest("/api/test", {}, { deadlineMs: 1_000, label: "Map places" });
    await expect(task.promise).rejects.toThrow("Map places returned 503");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves malformed JSON and synchronous transport failures", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("not JSON", { status: 200 }))
      .mockImplementationOnce(() => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetcher);
    await expect(startBoundedJsonRequest("/api/test", {}, { deadlineMs: 1_000, label: "Test" }).promise).rejects.toBeInstanceOf(SyntaxError);
    await expect(startBoundedJsonRequest("/api/test", {}, { deadlineMs: 1_000, label: "Test" }).promise).rejects.toThrow("offline");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns successful JSON and releases the deadline immediately", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"places":[]}', { status: 200 })));
    await expect(startBoundedJsonRequest("/api/test", { priority: "high" }, { deadlineMs: 1_000, label: "Test" }).promise).resolves.toEqual({ places: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
});
