import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlacePhotoBytesLoader, GOOGLE_PHOTO_BYTES_DEADLINE_MS } from "./place-photo-bytes";

const src = "/api/place-photo?slug=actual-place&name=places%2Factual-place%2Fphotos%2Fprimary&w=360&fallback=signal";
const photo = () => new Response(new Blob(["actual-response-bytes"], { type: "image/jpeg" }), {
  headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
});

describe("visible photo byte transport", () => {
  afterEach(() => vi.useRealTimers());
  it("shares only an in-flight exact request, consumes its bytes once, and retains no settled photo", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<() => Promise<Response>>().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockImplementation(async () => photo());
    const load = createPlacePhotoBytesLoader(fetcher);
    const first = load(src);
    const duplicate = load(src);
    expect(first).toBe(duplicate);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(src, {
      cache: "no-store", credentials: "same-origin", signal: expect.any(AbortSignal),
    });
    const response = photo();
    const read = vi.spyOn(response.body!, "getReader");
    finish(response);
    const result = await first;
    expect(result.kind).toBe("photo");
    if (result.kind !== "photo") throw new Error("Expected the received image bytes.");
    expect(await result.blob.text()).toBe("actual-response-bytes");
    expect(await duplicate).toBe(result);
    expect(read).toHaveBeenCalledTimes(1);
    await load(src);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reads a successful signal to EOF without publishing its body or poisoning a later request", async () => {
    let finish!: () => void;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        finish = () => controller.close();
      },
      cancel,
    });
    const fallback = new Response(stream, { headers: {
      "Content-Type": "image/png", "X-Photo-Fallback": "daily-cap",
    } });
    const blob = vi.spyOn(fallback, "blob");
    const reader = vi.spyOn(fallback.body!, "getReader");
    const fetcher = vi.fn().mockResolvedValueOnce(fallback).mockResolvedValueOnce(photo());
    const load = createPlacePhotoBytesLoader(fetcher);
    const pending = load(src);
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.waitFor(() => expect(reader).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);
    expect(load(src)).toBe(pending);
    expect(cancel).not.toHaveBeenCalled();
    finish();
    await expect(pending).resolves.toEqual({ kind: "fallback", reason: "daily-cap" });
    expect(blob).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(fallback.bodyUsed).toBe(true);
    expect(stream.locked).toBe(false);
    expect((await load(src)).kind).toBe("photo");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("bounds a stalled signal body by the same deadline and allows a later request", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); },
      cancel,
    });
    const fallback = new Response(stream, { headers: {
      "Content-Type": "image/png", "X-Photo-Fallback": "daily-cap",
    } });
    const fetcher = vi.fn().mockResolvedValueOnce(fallback).mockResolvedValueOnce(photo());
    const load = createPlacePhotoBytesLoader(fetcher);
    const pending = load(src);
    expect(load(src)).toBe(pending);
    await vi.advanceTimersByTimeAsync(GOOGLE_PHOTO_BYTES_DEADLINE_MS);
    await expect(pending).resolves.toEqual({ kind: "fallback", reason: "fetch-timeout" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await load(src)).kind).toBe("photo");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["HTTP error", "non-image"])("still cancels an untrusted %s body instead of draining it", async (kind) => {
    const response = kind === "HTTP error"
      ? new Response("error", { status: 503, headers: { "Content-Type": "image/png" } })
      : new Response("error", { headers: { "Content-Type": "text/html" } });
    const cancel = vi.spyOn(response.body!, "cancel");
    const reader = vi.spyOn(response.body!, "getReader");
    await expect(createPlacePhotoBytesLoader(async () => response)(src)).resolves.toEqual({
      kind: "fallback", reason: kind === "HTTP error" ? "http-503" : "not-image",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(reader).not.toHaveBeenCalled();
  });

  it.each([
    ["HTTP error", () => new Response("unavailable", { status: 503 }), "http-503"],
    ["non-image", () => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }), "not-image"],
    ["empty image", () => new Response(null, { headers: { "Content-Type": "image/jpeg" } }), "body-empty"],
    ["fetch error", () => Promise.reject(new Error("offline")), "fetch-error"],
  ])("leaves %s as an honest fallback", async (_label, respond, reason) => {
    const load = createPlacePhotoBytesLoader(async () => respond());
    await expect(load(src)).resolves.toEqual({ kind: "fallback", reason });
  });

  it.each([
    "https://places.googleapis.com/v1/places/other/photos/one/media",
    "//example.com/api/place-photo?name=places/a/photos/b&fallback=signal",
    "/api/place-photo?name=places/a/photos/b&name=places/other/photos/b&fallback=signal",
    "/api/place-photo?name=places/a/photos/b",
    "/api/place-photo?name=legacy-token&fallback=signal",
    src + "#different-source",
  ])("does not send an unapproved request: %s", async (candidate) => {
    const fetcher = vi.fn();
    await expect(createPlacePhotoBytesLoader(fetcher)(candidate)).resolves.toEqual({ kind: "fallback", reason: "invalid-source" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not mistake concurrent visible photos for source failure or retain their completed bytes", async () => {
    const completions: Array<(response: Response) => void> = [];
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => completions.push(resolve)));
    const load = createPlacePhotoBytesLoader(fetcher);
    const sources = Array.from({ length: 40 }, (_, index) => src.replace("w=360", `w=${index + 100}`));
    const waiting = sources.map(load);
    expect(fetcher).toHaveBeenCalledTimes(40);
    completions.forEach((finish) => finish(photo()));
    expect((await Promise.all(waiting)).every((entry) => entry.kind === "photo")).toBe(true);
    const later = load(sources[0]);
    expect(fetcher).toHaveBeenCalledTimes(41);
    completions.at(-1)!(photo());
    expect((await later).kind).toBe("photo");
  });
  it("aborts never-resolving headers at one full-response deadline and permits a later same-source request", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn<(source: string, init: RequestInit) => Promise<Response>>()
      .mockImplementationOnce((_source, init) => {
        signal = init.signal as AbortSignal;
        return new Promise(() => {});
      }).mockResolvedValueOnce(photo());
    const load = createPlacePhotoBytesLoader(fetcher);
    const waiting = load(src);
    expect(load(src)).toBe(waiting);
    await vi.advanceTimersByTimeAsync(GOOGLE_PHOTO_BYTES_DEADLINE_MS);
    await expect(waiting).resolves.toEqual({ kind: "fallback", reason: "fetch-timeout" });
    expect(signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1); // No automatic retry.
    expect((await load(src)).kind).toBe("photo");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a stalled response body under the same deadline, clears its entry and can recover later", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); },
      cancel,
    });
    const stalled = new Response(stream, { headers: { "Content-Type": "image/jpeg" } });
    const fetcher = vi.fn().mockResolvedValueOnce(stalled).mockResolvedValueOnce(photo());
    const load = createPlacePhotoBytesLoader(fetcher);
    const waiting = load(src);
    await vi.advanceTimersByTimeAsync(GOOGLE_PHOTO_BYTES_DEADLINE_MS);
    await expect(waiting).resolves.toEqual({ kind: "fallback", reason: "fetch-timeout" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await load(src)).kind).toBe("photo");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards late headers after timeout without poisoning a newer same-source request", async () => {
    vi.useFakeTimers();
    let finishOld!: (response: Response) => void;
    let finishNew!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishNew = resolve; }));
    const load = createPlacePhotoBytesLoader(fetcher);
    const old = load(src);
    await vi.advanceTimersByTimeAsync(GOOGLE_PHOTO_BYTES_DEADLINE_MS);
    await expect(old).resolves.toMatchObject({ reason: "fetch-timeout" });
    const fresh = load(src);
    const late = photo();
    const cancel = vi.spyOn(late.body!, "cancel");
    finishOld(late);
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(load(src)).toBe(fresh);
    finishNew(photo());
    expect((await fresh).kind).toBe("photo");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["photo", "signal"])("cancels an oversized %s body without publishing it", async (kind) => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); },
      cancel,
    });
    const headers: HeadersInit = kind === "signal"
      ? { "Content-Type": "image/png", "X-Photo-Fallback": "daily-cap" }
      : { "Content-Type": "image/jpeg" };
    const load = createPlacePhotoBytesLoader(async () => new Response(stream, { headers }));
    await expect(load(src)).resolves.toEqual({ kind: "fallback", reason: "body-too-large" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

});
