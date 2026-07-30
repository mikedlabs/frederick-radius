import { afterEach, describe, expect, it, vi } from "vitest";
import {
  searchTavilyCandidates,
  TavilySearchError,
} from "../scripts/lib/tavily-search";

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
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
    const fetchImpl = vi.fn(
      async (...args: Parameters<typeof fetch>) => {
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
      },
    );

    const result = await searchTavilyCandidates(
      "  Frederick road closure  ",
      {
        apiKey: "tvly-secret",
        allowedDomains: ["https://www.frederickcountymd.gov/"],
        maxResults: 5,
        fetchImpl,
      },
    );

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
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
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
