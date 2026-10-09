import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { inflateSync } from "node:zlib";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  isOverPaidRequestBudget: vi.fn(),
  isSameOriginRequest: vi.fn(),
  isUnattributedRequest: vi.fn(),
  photoUrl: vi.fn(),
  reserveDailyUsage: vi.fn(),
}));

vi.mock("@/lib/integrations/google-places", () => ({
  photoUrl: mocks.photoUrl,
}));
vi.mock("@/data/places", () => ({ PLACE_BY_SLUG: {} }));
vi.mock("@/data/categories", () => ({ CATEGORY_BY_SLUG: {} }));
vi.mock("@/lib/origin-check", () => ({
  isOverPaidRequestBudget: mocks.isOverPaidRequestBudget,
  isSameOriginRequest: mocks.isSameOriginRequest,
  isUnattributedRequest: mocks.isUnattributedRequest,
}));
vi.mock("@/lib/usage-meter", () => ({
  reserveDailyUsage: mocks.reserveDailyUsage,
}));

import { GET } from "./route";

function request(overrides: Record<string, string> = {}, signal?: AbortSignal) {
  const params = new URLSearchParams({
    name: "places/test-place/photos/test-photo",
    w: "800",
    ...overrides,
  });
  return new NextRequest(
    `https://frederickradius.app/api/place-photo?${params.toString()}`,
    { signal },
  );
}

async function expectTransparentPixel(response: Response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.toString("ascii", 12, 16)).toBe("IHDR");
  expect(bytes.readUInt32BE(16)).toBe(1);
  expect(bytes.readUInt32BE(20)).toBe(1);
  expect([...bytes.subarray(24, 29)]).toEqual([8, 6, 0, 0, 0]);
  const pixels: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      pixels.push(bytes.subarray(offset + 8, offset + 8 + size));
    }
    offset += 12 + size;
  }
  // One unfiltered RGBA pixel: all channels zero, including full transparency.
  expect(inflateSync(Buffer.concat(pixels))).toEqual(Buffer.from([0, 0, 0, 0, 0]));
  expect(bytes.length).toBeLessThan(100);
}

describe("GET /api/place-photo daily budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", "");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.isSameOriginRequest.mockReturnValue(true);
    mocks.isUnattributedRequest.mockReturnValue(false);
    mocks.isOverPaidRequestBudget.mockResolvedValue(false);
    mocks.photoUrl.mockReturnValue("https://places.googleapis.test/photo");
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: true, count: 1 });
    mocks.fetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects an unattributed request before any paid work", async () => {
    mocks.isUnattributedRequest.mockReturnValue(true);

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.isOverPaidRequestBudget).not.toHaveBeenCalled();
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("reserves the default spike-breaker budget before the paid fetch", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-photo-fallback")).toBeNull();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("google_photo", 1_500);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0],
    );
  });

  it("returns artwork without fetching when the cap is exhausted", async () => {
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", "7");
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 7 });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("x-photo-fallback")).toBe("daily-cap");
    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("google_photo", 7);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("uses the safe default for a malformed cap", async () => {
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", "100photos-private-value");
    mocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 1_500 });

    const response = await GET(request());

    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith("google_photo", 1_500);
    expect(response.headers.get("x-photo-fallback")).toBe("daily-cap");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["0", 1],
    ["100000", 2_000],
  ])("clamps a numeric cap of %s to %i", async (configured, expected) => {
    vi.stubEnv("GOOGLE_PHOTO_DAILY_CAP", configured);

    await GET(request());

    expect(mocks.reserveDailyUsage).toHaveBeenCalledWith(
      "google_photo",
      expected,
    );
  });

  it("bounds stalled upstream headers and consumes a late response without a retry", async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    mocks.fetch.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    const cancel = vi.fn();
    let lateStream!: ReadableStreamDefaultController<Uint8Array>;
    const late = new Response(new ReadableStream<Uint8Array>({ start(controller) { lateStream = controller; }, cancel }), { headers: { "Content-Type": "image/jpeg" } });
    let completed = false;
    const pending = GET(request()).then(async (response) => {
      await response.arrayBuffer(); completed = true; return response;
    });
    try {
      await vi.advanceTimersByTimeAsync(8_000);
      expect(completed).toBe(true);
      const response = await pending;
      expect(response.headers.get("x-photo-fallback")).toBe("fetch-timeout");
      expect(mocks.fetch).toHaveBeenCalledOnce();
      expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
    } finally {
      finish(late);
      await vi.advanceTimersByTimeAsync(0);
      try { lateStream.close(); } catch { /* A late timed-out response was already cancelled. */ }
      await pending;
    }
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds a partial stalled image body before returning the existing artwork", async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    mocks.fetch.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) { stream = controller; controller.enqueue(new Uint8Array([1, 2, 3])); },
      cancel,
    }), { headers: { "Content-Type": "image/jpeg" } }));
    let completed = false;
    const pending = GET(request()).then(async (response) => {
      const bytes = await response.arrayBuffer(); completed = true; return { response, bytes };
    });
    try {
      await vi.advanceTimersByTimeAsync(8_000);
      expect(completed).toBe(true);
      const { response, bytes } = await pending;
      expect(response.headers.get("x-photo-fallback")).toBe("fetch-timeout");
      expect(response.headers.get("content-type")).toBe("image/svg+xml");
      expect(new TextDecoder().decode(bytes)).toContain("PHOTO NOT AVAILABLE");
      expect(cancel).toHaveBeenCalledOnce();
      expect(mocks.fetch).toHaveBeenCalledOnce();
    } finally {
      try { stream.close(); } catch { /* A timed-out stream was already cancelled. */ }
      await pending;
    }
  });

  it("preserves exact complete binary bytes, photo identity and no-store headers", async () => {
    vi.useFakeTimers();
    const req = request();
    const add = vi.spyOn(req.signal, "addEventListener");
    const remove = vi.spyOn(req.signal, "removeEventListener");
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    mocks.fetch.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) { stream = controller; controller.enqueue(new Uint8Array([0, 255, 31])); },
    }), { headers: { "Content-Type": "image/png" } }));
    let complete = false;
    const pending = GET(req).then((response) => { complete = true; return response; });
    await vi.advanceTimersByTimeAsync(100);
    expect(complete).toBe(false);
    stream.enqueue(new Uint8Array([128, 1, 2]));
    stream.close();
    const response = await pending;
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 255, 31, 128, 1, 2]));
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-photo-fallback")).toBeNull();
    expect(mocks.photoUrl).toHaveBeenCalledExactlyOnceWith("places/test-place/photos/test-photo", 800);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("https://places.googleapis.test/photo", expect.objectContaining({ redirect: "follow", cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(add).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(false);
  });

  it.each(["headers", "body"])("settles caller cancellation during %s without waiting for transport cleanup", async (phase) => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    mocks.fetch.mockImplementation(() => phase === "headers" ? new Promise<Response>(() => {}) : Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel }))));
    const pending = GET(request({}, caller.signal));
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();
    const response = await pending;
    expect(response.headers.get("x-photo-fallback")).toBe("caller-aborted");
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
    if (phase === "body") expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["no-key", "daily-cap", "upstream-400"])("returns a transparent intrinsic pixel for the %s signal without losing its reason", async (reason) => {
    if (reason === "no-key") mocks.photoUrl.mockReturnValue(null);
    if (reason === "daily-cap") mocks.reserveDailyUsage.mockResolvedValue({ reserved: false, count: 1_500 });
    if (reason === "upstream-400") mocks.fetch.mockResolvedValue(new Response(null, { status: 400 }));
    const response = await GET(request({ fallback: "signal" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-photo-fallback")).toBe(reason);
    await expectTransparentPixel(response);
    expect(mocks.fetch).toHaveBeenCalledTimes(reason === "upstream-400" ? 1 : 0);
    expect(mocks.reserveDailyUsage).toHaveBeenCalledTimes(reason === "no-key" ? 0 : 1);
  });

  it("does no paid work for an already cancelled caller and keeps the signal fallback", async () => {
    const caller = new AbortController(); caller.abort();
    const response = await GET(request({ fallback: "signal" }, caller.signal));
    expect(response.headers.get("x-photo-fallback")).toBe("caller-aborted");
    await expectTransparentPixel(response);
    expect(mocks.isOverPaidRequestBudget).not.toHaveBeenCalled();
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["rate", "reservation"])("bounds stalled %s allowance and prevents late paid work", async (phase) => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const allowance = new Promise((resolve) => { finish = resolve; });
    if (phase === "rate") mocks.isOverPaidRequestBudget.mockReturnValue(allowance);
    else mocks.reserveDailyUsage.mockReturnValue(allowance);
    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(8_000);
    const response = await pending;
    expect(response.headers.get("x-photo-fallback")).toBe("fetch-timeout");
    expect(mocks.fetch).not.toHaveBeenCalled();
    finish(phase === "rate" ? false : { reserved: true, count: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledTimes(phase === "rate" ? 0 : 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one total deadline across allowance, headers and a stalled body", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    mocks.isOverPaidRequestBudget.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(false), 1_000)));
    mocks.reserveDailyUsage.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ reserved: true, count: 1 }), 1_000)));
    mocks.fetch.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(new Response(new ReadableStream({ cancel }))), 3_000)));
    let complete = false;
    const pending = GET(request()).then((response) => { complete = true; return response; });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(complete).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).headers.get("x-photo-fallback")).toBe("fetch-timeout");
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["advertised", "streamed"])("rejects an oversized %s image with bounded memory and no retry", async (sizeKind) => {
    const cancel = vi.fn();
    mocks.fetch.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        if (sizeKind === "streamed") {
          controller.enqueue(new Uint8Array(4 * 1024 * 1024));
          controller.enqueue(new Uint8Array([1]));
        }
      },
      cancel,
    }), { headers: sizeKind === "advertised" ? { "Content-Length": String(4 * 1024 * 1024 + 1) } : {} }));
    const response = await GET(request());
    expect(response.headers.get("x-photo-fallback")).toBe("body-too-large");
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
  });

  it("returns a complete image at the 4 MiB response boundary", async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024);
    bytes[0] = 255;
    bytes[bytes.length - 1] = 127;
    mocks.fetch.mockResolvedValue(new Response(bytes, {
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(bytes.length) },
    }));

    const response = await GET(request());
    const delivered = new Uint8Array(await response.arrayBuffer());

    expect(response.headers.get("x-photo-fallback")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(delivered.byteLength).toBe(bytes.byteLength);
    expect(delivered[0]).toBe(255);
    expect(delivered[delivered.length - 1]).toBe(127);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", undefined],
    ["misleading", "1"],
    ["too large", String(5 * 1024 * 1024)],
  ])("returns fallback for a 5 MiB image with %s Content-Length", async (_label, contentLength) => {
    const bytes = new Uint8Array(5 * 1024 * 1024);
    mocks.fetch.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }), { headers: contentLength === undefined ? {} : { "Content-Length": contentLength } }));

    const response = await GET(request());

    expect(response.headers.get("x-photo-fallback")).toBe("body-too-large");
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect((await response.arrayBuffer()).byteLength).toBeLessThan(4 * 1024 * 1024);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
  });

  it.each([undefined, "0"])("rejects an empty 200 photo with Content-Length %s", async (contentLength) => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array(), {
      headers: { "Content-Type": "image/jpeg", ...(contentLength === undefined ? {} : { "Content-Length": contentLength }) },
    }));

    const response = await GET(request());

    expect(response.headers.get("x-photo-fallback")).toBe("body-empty");
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
  });

  it.each([
    ["shorter", "4"],
    ["longer", "2"],
  ])("rejects a cleanly closed identity body %s than Content-Length", async (_label, contentLength) => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "image/png", "Content-Length": contentLength, "Content-Encoding": "identity" },
    }));

    const response = await GET(request());

    expect(response.headers.get("x-photo-fallback")).toBe("body-incomplete");
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
  });

  it("preserves nonempty identity bytes whose declared length matches", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    mocks.fetch.mockResolvedValue(new Response(bytes, {
      headers: { "Content-Type": "image/png", "Content-Length": "3", "Content-Encoding": "identity" },
    }));

    const response = await GET(request());

    expect(response.headers.get("x-photo-fallback")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("preserves fetch-decoded bytes when encoded Content-Length describes the wire body", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    // Native fetch's local mock proof delivers three decoded bytes but retains
    // the gzip wire length of 23; that header is not decoded-body authority.
    mocks.fetch.mockResolvedValue(new Response(bytes, {
      headers: { "Content-Type": "image/png", "Content-Length": "23", "Content-Encoding": "gzip" },
    }));

    const response = await GET(request());

    expect(response.headers.get("x-photo-fallback")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("stops pathological empty chunks instead of an unbounded body-read loop", async () => {
    const cancel = vi.fn();
    mocks.fetch.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array()); }, cancel })));
    const response = await GET(request());
    expect(response.headers.get("x-photo-fallback")).toBe("body-read-limit");
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("consumes a late transport rejection without changing its completed fallback", async () => {
    vi.useFakeTimers();
    let reject!: (reason: Error) => void;
    mocks.fetch.mockReturnValue(new Promise<Response>((_resolve, fail) => { reject = fail; }));
    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(8_000);
    const response = await pending;
    expect(response.headers.get("x-photo-fallback")).toBe("fetch-timeout");
    reject(new Error("Late unavailable source"));
    await vi.advanceTimersByTimeAsync(0);
    expect(response.headers.get("x-photo-fallback")).toBe("fetch-timeout");
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("keeps a later independent photo request usable after a timeout", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>(() => {}));
    const first = GET(request());
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await first).headers.get("x-photo-fallback")).toBe("fetch-timeout");
    const second = await GET(request());
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(second.headers.get("x-photo-fallback")).toBeNull();
    expect(mocks.fetch.mock.calls[1][1].signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([["abc", 800], ["0", 80], ["-20", 80], ["9999", 1600]])("keeps existing width bounds for %s", async (width, expected) => {
    await GET(request({ w: String(width) }));
    expect(mocks.photoUrl).toHaveBeenCalledWith("places/test-place/photos/test-photo", expected);
  });

  it("keeps the foreign-origin and invalid-name guards ahead of paid work", async () => {
    mocks.isSameOriginRequest.mockReturnValue(false);
    expect((await GET(request())).status).toBe(403);
    mocks.isSameOriginRequest.mockReturnValue(true);
    expect((await GET(request({ name: "https://evil.example/photo" }))).status).toBe(400);
    expect(mocks.isOverPaidRequestBudget).not.toHaveBeenCalled();
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["rate-limited", "no-key"])("keeps %s fallback before any reservation", async (reason) => {
    if (reason === "rate-limited") mocks.isOverPaidRequestBudget.mockResolvedValue(true);
    else mocks.photoUrl.mockReturnValue(null);
    const response = await GET(request());
    expect(response.headers.get("x-photo-fallback")).toBe(reason);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    expect(mocks.reserveDailyUsage).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not heal a failed exact photo with a different Google identity", async () => {
    const cancel = vi.fn();
    mocks.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 404 }));
    const response = await GET(request({ fallback: "signal" }));
    expect(response.headers.get("x-photo-fallback")).toBe("upstream-404");
    await expectTransparentPixel(response);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.photoUrl).toHaveBeenCalledExactlyOnceWith("places/test-place/photos/test-photo", 800);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.reserveDailyUsage).toHaveBeenCalledOnce();
  });

  it("fails closed when the budget database is unavailable", async () => {
    mocks.reserveDailyUsage.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("x-photo-fallback")).toBe(
      "budget-unavailable",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
