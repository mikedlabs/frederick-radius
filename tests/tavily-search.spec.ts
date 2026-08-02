import { afterEach, describe, expect, it, vi } from "vitest";
import {
  searchTavilyCandidates,
  TavilySearchError,
} from "../scripts/lib/tavily-search";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchTavilyCandidates", () => {
  it("returns source evidence, disables generated answers, and enforces the domain allowlist twice", async () => {
    const fetchImpl = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return jsonResponse({
        query: "Frederick road closure",
        answer: "A generated answer that must not reach the caller.",
        results: [
          {
            url: "https://www.frederickcountymd.gov/road-closure",
            title: "Road closure",
            content: "Official notice content.",
            score: 0.97,
          },
          {
            url: "https://alerts.frederickcountymd.gov/update",
            title: "County alert",
            content: "Official alert content.",
            score: 0.91,
          },
          {
            url: "https://example.com/copied-post",
            title: "Unapproved repost",
            content: "This result must be removed locally.",
            score: 0.99,
          },
        ],
        response_time: "1.12",
        request_id: "request-123",
        usage: { credits: 1 },
      });
    });

    const result = await searchTavilyCandidates("  Frederick road closure  ", {
      apiKey: "tvly-secret",
      allowedDomains: ["https://www.frederickcountymd.gov/"],
      maxResults: 5,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.tavily.com/search");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer tvly-secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      query: "Frederick road closure",
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
      include_domains: ["frederickcountymd.gov"],
      include_usage: true,
    });

    expect(result).toEqual({
      query: "Frederick road closure",
      candidates: [
        {
          url: "https://www.frederickcountymd.gov/road-closure",
          title: "Road closure",
          content: "Official notice content.",
          score: 0.97,
        },
        {
          url: "https://alerts.frederickcountymd.gov/update",
          title: "County alert",
          content: "Official alert content.",
          score: 0.91,
        },
      ],
      requestId: "request-123",
      responseTime: "1.12",
      credits: 1,
    });
    expect(result).not.toHaveProperty("answer");
  });

  it("enforces maxResults locally when the provider over-returns", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        query: "Frederick official sources",
        results: Array.from({ length: 25 }, (_, index) => ({
          url: `https://example.com/source-${index + 1}`,
          title: `Source ${index + 1}`,
          content: "Transient result content.",
          score: 1 - index / 100,
        })),
      }),
    );

    const result = await searchTavilyCandidates("Frederick official sources", {
      apiKey: "tvly-secret",
      maxResults: 5,
      fetchImpl,
    });

    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.map(({ url }) => url)).toEqual(
      Array.from(
        { length: 5 },
        (_, index) => `https://example.com/source-${index + 1}`,
      ),
    );
  });

  it.each([
    [400, "bad_request", "Invalid topic.", null],
    [401, "unauthorized", "Unauthorized: missing or invalid API key.", null],
    [429, "rate_limited", "Please reduce the rate of requests.", "60"],
    [432, "plan_limit_exceeded", "Plan usage limit reached.", null],
    [433, "payg_limit_exceeded", "Pay-as-you-go limit reached.", null],
    [500, "api_error", "Internal Server Error", null],
  ] as const)(
    "preserves the Tavily API error for HTTP %i",
    async (status, code, message, retryAfter) => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(
          { detail: { error: message }, request_id: `request-${status}` },
          {
            status,
            headers: retryAfter ? { "retry-after": retryAfter } : {},
          },
        ),
      );

      const caught = await searchTavilyCandidates("test", {
        apiKey: "tvly-secret",
        fetchImpl,
      }).catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(TavilySearchError);
      expect(caught).toMatchObject({
        message,
        code,
        status,
        retryAfter,
        requestId: `request-${status}`,
      });
    },
  );

  it("aborts a slow request at the configured timeout", async () => {
    const fetchImpl = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    await expect(
      searchTavilyCandidates("slow query", {
        apiKey: "tvly-secret",
        timeoutMs: 5,
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "timeout",
      status: null,
      message: "Tavily search timed out after 5ms.",
    });
  });

  it("does not log or surface the API key when the transport fails", async () => {
    const key = "tvly-never-print-this";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => {
      throw new Error(`Request with Bearer ${key} failed`);
    });

    const caught = await searchTavilyCandidates("network failure", {
      apiKey: key,
      fetchImpl,
    }).catch((value: unknown) => value);

    expect(caught).toBeInstanceOf(TavilySearchError);
    expect(caught).toMatchObject({ code: "network_error" });
    expect((caught as Error).message).not.toContain(key);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("rejects an oversized response from Content-Length before parsing it", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "content-length": "1000001",
            "x-request-id": "oversized-header-response",
          },
        }),
    );

    await expect(
      searchTavilyCandidates("oversized response", {
        apiKey: "tvly-secret",
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "response_too_large",
      status: 200,
      requestId: "oversized-header-response",
      message: "Tavily Search API response exceeded the 1000000-byte limit.",
    });
  });

  it("counts streamed response bytes when Content-Length is absent", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600_000));
        controller.enqueue(new Uint8Array(400_001));
        controller.close();
      },
    });
    const fetchImpl = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "x-tavily-request-id": "oversized-stream-response" },
        }),
    );

    await expect(
      searchTavilyCandidates("oversized stream", {
        apiKey: "tvly-secret",
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "response_too_large",
      status: 200,
      requestId: "oversized-stream-response",
    });
  });

  it("keeps only public HTTP(S) result URLs during open discovery", async () => {
    const resultFor = (url: string, score: number) => ({
      url,
      title: url,
      content: "Transient search-result content.",
      score,
    });
    const safeUrls = [
      "https://frederickcountymd.gov/notices?type=road",
      "http://8.8.8.8/status",
      "https://[2606:4700:4700::1111]/status",
    ];
    const unsafeUrls = [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ftp://frederickcountymd.gov/notices",
      "https://user:password@frederickcountymd.gov/notices",
      "https://frederickcountymd.gov/notices#details",
      "http://localhost/admin",
      "http://service.local/admin",
      "http://intranet/admin",
      "http://service.internal/admin",
      "http://source.test/admin",
      "http://source.invalid/admin",
      "http://source.example/admin",
      "http://router.home.arpa/admin",
      "http://hidden.onion/admin",
      "http://127.0.0.1/admin",
      "http://2130706433/admin",
      "http://0x7f000001/admin",
      "http://10.0.0.8/admin",
      "http://100.64.0.1/admin",
      "http://169.254.169.254/latest/meta-data",
      "http://172.16.0.1/admin",
      "http://192.168.1.1/admin",
      "http://192.0.2.1/example",
      "http://198.18.0.1/benchmark",
      "http://198.51.100.1/example",
      "http://203.0.113.1/example",
      "http://224.0.0.1/multicast",
      "http://[::1]/admin",
      "http://[fc00::1]/admin",
      "http://[fe80::1]/admin",
      "http://[2001:db8::1]/example",
      "http://[::ffff:127.0.0.1]/admin",
      " https://frederickcountymd.gov/notices",
      "https://frederickcountymd.gov/notices\n",
      "https://FREDERICKCOUNTYMD.GOV/notices",
    ];
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        query: "open discovery",
        results: [...safeUrls, ...unsafeUrls].map((url, index) =>
          resultFor(url, 1 - index / 100),
        ),
      }),
    );

    const result = await searchTavilyCandidates("open discovery", {
      apiKey: "tvly-secret",
      fetchImpl,
    });

    expect(result.candidates.map(({ url }) => url)).toEqual(safeUrls);
  });

  it("rejects invalid allowlist entries before making a request", async () => {
    const fetchImpl = vi.fn();

    await expect(
      searchTavilyCandidates("candidate", {
        apiKey: "tvly-secret",
        allowedDomains: ["https://example.com/private/path"],
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "configuration",
      message:
        'Invalid Tavily allowed domain: "https://example.com/private/path".',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
