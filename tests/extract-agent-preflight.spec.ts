import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnthropicProviderError,
  extractJson,
  extractJsonFromImage,
  extractJsonStrict,
  preflightKey,
} from "../scripts/lib/extract-agent";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Anthropic extractor preflight", () => {
  it.each([200, 201, 299])(
    "accepts a real 2xx response (HTTP %s)",
    async (status) => {
      const fetchImpl = vi.fn(
        async () => new Response("", { status }),
      );

      await expect(
        preflightKey({
          apiKey: "test-key",
          failInCi: false,
          fetchImpl,
        }),
      ).resolves.toBe(true);
    },
  );

  it.each([300, 400, 401, 403, 408])(
    "rejects a non-2xx response (HTTP %s)",
    async (status) => {
      const fetchImpl = vi.fn(
        async () => new Response("not accepted", { status }),
      );

      await expect(
        preflightKey({
          apiKey: "test-key",
          failInCi: false,
          fetchImpl,
          maxRetries: 0,
        }),
      ).resolves.toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("honors Retry-After for a retryable preflight failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("busy", {
          status: 529,
          headers: { "retry-after": "2" },
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const sleepImpl = vi.fn(async () => {});

    await expect(
      preflightKey({
        apiKey: "test-key",
        failInCi: false,
        fetchImpl,
        sleepImpl,
      }),
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(2_000);
  });

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

describe("strict Anthropic extraction requests", () => {
  const success = () =>
    new Response(
      JSON.stringify({
        content: [{ text: '{"townHall":{"label":"Town Hall"}}' }],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );

  it.each([429, 500, 529])(
    "retries HTTP %s and honors Retry-After",
    async (status) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          new Response("try later", {
            status,
            headers: { "retry-after": "1.5" },
          }),
        )
        .mockResolvedValueOnce(success());
      const sleepImpl = vi.fn(async () => {});

      await expect(
        extractJsonStrict("Return civic data.", "page text", {
          apiKey: "test-key",
          fetchImpl,
          sleepImpl,
        }),
      ).resolves.toEqual({ townHall: { label: "Town Hall" } });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleepImpl).toHaveBeenCalledWith(1_500);
    },
  );

  it.each([400, 401, 403, 408])(
    "does not retry non-retryable HTTP %s",
    async (status) => {
      const fetchImpl = vi.fn(
        async () => new Response("hard failure", { status }),
      );
      const sleepImpl = vi.fn(async () => {});

      const result = extractJsonStrict("Return civic data.", "page text", {
        apiKey: "test-key",
        fetchImpl,
        sleepImpl,
      });
      await expect(result).rejects.toMatchObject({
        name: "AnthropicProviderError",
        status,
        attempts: 1,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleepImpl).not.toHaveBeenCalled();
    },
  );

  it("fails provider-wide after the bounded retry ceiling", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("overloaded", {
          status: 529,
          headers: { "retry-after": "0" },
        }),
    );
    const sleepImpl = vi.fn(async () => {});

    const result = extractJsonStrict("Return civic data.", "page text", {
      apiKey: "test-key",
      fetchImpl,
      sleepImpl,
      maxRetries: 2,
    });
    await expect(result).rejects.toMatchObject({
      name: "AnthropicProviderError",
      kind: "provider",
      status: 529,
      attempts: 3,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry earlier than an oversized Retry-After", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "120" },
        }),
    );
    const sleepImpl = vi.fn(async () => {});

    await expect(
      extractJsonStrict("Return civic data.", "page text", {
        apiKey: "test-key",
        fetchImpl,
        sleepImpl,
        maxRetryDelayMs: 5_000,
      }),
    ).rejects.toMatchObject({
      name: "AnthropicProviderError",
      kind: "rate-limit",
      status: 429,
      attempts: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it("does not retry network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network unavailable");
    });
    const sleepImpl = vi.fn(async () => {});

    await expect(
      extractJsonStrict("Return civic data.", "page text", {
        apiKey: "test-key",
        fetchImpl,
        sleepImpl,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnthropicProviderError>>({
        name: "AnthropicProviderError",
        kind: "network",
        attempts: 1,
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
  });
});
