import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractJson,
  extractJsonFromImage,
  preflightKey,
} from "../scripts/lib/extract-agent";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Anthropic extractor preflight", () => {
  it("returns a controlled failure when the network rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network unavailable");
    });

    await expect(
      preflightKey({
        apiKey: "test-key",
        failInCi: false,
        fetchImpl,
      }),
    ).resolves.toBe(false);
  });

  it("bounds a hung preflight so deterministic feeds can continue", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const result = preflightKey({
      apiKey: "test-key",
      failInCi: false,
      fetchImpl,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toBe(false);
  });
});

describe("Anthropic extraction requests", () => {
  it("returns null when a text extraction request rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network unavailable");
    });

    await expect(
      extractJson("Return an empty array.", "page text", {
        apiKey: "test-key",
        fetchImpl,
      }),
    ).resolves.toBeNull();
  });

  it("bounds a hung text extraction request", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const result = extractJson("Return an empty array.", "page text", {
      apiKey: "test-key",
      fetchImpl,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toBeNull();
  });

  it("returns null when a text response body cannot be decoded", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("truncated JSON");
      },
    }) as unknown as Response);

    await expect(
      extractJson("Return an empty array.", "page text", {
        apiKey: "test-key",
        fetchImpl,
      }),
    ).resolves.toBeNull();
  });

  it("returns null when an image extraction request rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network unavailable");
    });

    await expect(
      extractJsonFromImage(
        "Return an empty array.",
        "https://example.com/calendar.png",
        { apiKey: "test-key", fetchImpl },
      ),
    ).resolves.toBeNull();
  });

  it("bounds a hung image extraction request", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const result = extractJsonFromImage(
      "Return an empty array.",
      "https://example.com/calendar.png",
      { apiKey: "test-key", fetchImpl, timeoutMs: 25 },
    );
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toBeNull();
  });

  it("returns null when an image response body cannot be decoded", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("truncated JSON");
      },
    }) as unknown as Response);

    await expect(
      extractJsonFromImage(
        "Return an empty array.",
        "https://example.com/calendar.png",
        { apiKey: "test-key", fetchImpl },
      ),
    ).resolves.toBeNull();
  });
});
