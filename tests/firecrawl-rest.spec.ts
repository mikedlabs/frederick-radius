import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchFirecrawlPage,
  FirecrawlRestError,
  validateFirecrawlPublicUrl,
} from "../scripts/lib/firecrawl-rest";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Firecrawl REST adapter", () => {
  it("requires HTTPS by default and rejects private or reserved targets", () => {
    expect(() => validateFirecrawlPublicUrl("http://example.com")).toThrowError(
      FirecrawlRestError,
    );
    expect(
      validateFirecrawlPublicUrl("http://example.com", { allowHttp: true })
        .protocol,
    ).toBe("http:");

    for (const url of [
      "https://localhost/source",
      "https://service.local/source",
      "https://127.0.0.1/source",
      "https://10.0.0.4/source",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/source",
      "https://192.0.2.1/source",
    ]) {
      expect(() => validateFirecrawlPublicUrl(url), url).toThrowError(
        FirecrawlRestError,
      );
    }
  });

  it("sends the exact requested URL and returns an attributable snapshot", async () => {
    const requestedUrl =
      "https://example.com/events?town=Frederick&date=2026-07-30";
    const fetchImpl = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        void input;
        void init;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "# Tonight\n\nAlive at Five",
              links: [
                "https://example.com/events/alive-at-five",
                "https://example.com/tickets",
              ],
              metadata: {
                sourceURL: requestedUrl,
                url: "https://www.example.com/events?town=Frederick&date=2026-07-30",
                statusCode: 200,
                title: "Events",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );

    const result = await fetchFirecrawlPage(requestedUrl, {
      apiKey: "fc-test-secret",
      fetchImpl,
      timeoutMs: 1_000,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchImpl.mock.calls[0];
    expect(endpoint).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer fc-test-secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      url: requestedUrl,
      formats: ["markdown", "links"],
      onlyMainContent: true,
      skipTlsVerification: false,
      timeout: 1_000,
    });

    expect(result).toEqual({
      requestedUrl,
      finalUrl: "https://www.example.com/events?town=Frederick&date=2026-07-30",
      text: "# Tonight\n\nAlive at Five",
      markdown: "# Tonight\n\nAlive at Five",
      links: [
        "https://example.com/events/alive-at-five",
        "https://example.com/tickets",
      ],
      metadata: {
        sourceURL: requestedUrl,
        url: "https://www.example.com/events?town=Frederick&date=2026-07-30",
        statusCode: 200,
        title: "Events",
      },
    });
  });

  it("falls back to the requested URL when Firecrawl omits redirect metadata", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { markdown: "Public page" },
          }),
          { status: 200 },
        ),
    );

    await expect(
      fetchFirecrawlPage("https://example.com", {
        apiKey: "fc-test-secret",
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com",
      links: [],
      metadata: {},
    });
  });

  it("can request raw source content without converting an RSS feed", async () => {
    const requestedUrl = "https://example.com/events.rss";
    const xml = '<?xml version="1.0"?><rss><channel></channel></rss>';
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              rawHtml: xml,
              metadata: {
                url: requestedUrl,
                statusCode: 200,
                contentType: "application/rss+xml",
              },
            },
          }),
          { status: 200 },
        ),
    );

    const result = await fetchFirecrawlPage(requestedUrl, {
      apiKey: "fc-test-secret",
      fetchImpl,
      outputFormat: "rawHtml",
      onlyMainContent: false,
      maxAgeMs: 7_200_000,
      proxy: "basic",
    });

    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      url: requestedUrl,
      formats: ["rawHtml"],
      onlyMainContent: false,
      skipTlsVerification: false,
      timeout: 19_500,
      maxAge: 7_200_000,
      storeInCache: true,
      proxy: "basic",
    });
    expect(result).toMatchObject({
      requestedUrl,
      finalUrl: requestedUrl,
      text: xml,
      markdown: "",
      rawHtml: xml,
    });
  });

  it("uses Firecrawl's current enhanced proxy name when explicitly requested", async () => {
    const requestedUrl = "https://example.com/protected";
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "Verified public page",
              metadata: { url: requestedUrl },
            },
          }),
          { status: 200 },
        ),
    );

    await fetchFirecrawlPage(requestedUrl, {
      apiKey: "fc-test-secret",
      fetchImpl,
      proxy: "enhanced",
    });

    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      url: requestedUrl,
      proxy: "enhanced",
    });
  });

  it("sends an explicit fresh, no-storage, single-credit v2 scrape policy", async () => {
    const requestedUrl = "https://example.com/current-events";
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "Current public events",
              metadata: { url: requestedUrl, statusCode: 200 },
            },
          }),
          { status: 200 },
        ),
    );

    await fetchFirecrawlPage(requestedUrl, {
      apiKey: "fc-test-secret",
      fetchImpl,
      maxAgeMs: 0,
      storeInCache: false,
      proxy: "basic",
    });

    const [endpoint, init] = fetchImpl.mock.calls[0];
    expect(endpoint).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(JSON.parse(String(init?.body))).toEqual({
      url: requestedUrl,
      formats: ["markdown", "links"],
      onlyMainContent: true,
      skipTlsVerification: false,
      timeout: 19_500,
      proxy: "basic",
      maxAge: 0,
      storeInCache: false,
    });
  });

  it("bounds hung requests with the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const request = fetchFirecrawlPage("https://example.com", {
      apiKey: "fc-test-secret",
      fetchImpl,
      timeoutMs: 25,
    });
    const rejection = expect(request).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "Firecrawl request timed out after 25ms.",
    });
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("keeps the timeout active while the response body is being read", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      async (
        _url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("aborted", "AbortError"));
            });
          },
        });
        return new Response(stream, { status: 200 });
      },
    );

    const request = fetchFirecrawlPage("https://example.com", {
      apiKey: "fc-test-secret",
      fetchImpl,
      timeoutMs: 25,
    });
    const rejection = expect(request).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "Firecrawl request timed out after 25ms.",
    });
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("rejects a response that exceeds the configured byte ceiling", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ success: true, data: { markdown: "large" } }),
          {
            status: 200,
            headers: { "Content-Length": "2048" },
          },
        ),
    );

    await expect(
      fetchFirecrawlPage("https://example.com", {
        apiKey: "fc-test-secret",
        fetchImpl,
        maxResponseBytes: 1_024,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("can require Firecrawl to report the final source URL", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: { markdown: "Public page", metadata: { statusCode: 200 } },
          }),
          { status: 200 },
        ),
    );

    await expect(
      fetchFirecrawlPage("https://example.com", {
        apiKey: "fc-test-secret",
        fetchImpl,
        requireReportedFinalUrl: true,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: "Firecrawl did not report the final source URL.",
    });
  });

  it("does not accept sourceURL alone as strict final-URL evidence", async () => {
    const requestedUrl = "https://example.com/events.rss";
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              rawHtml: '<?xml version="1.0"?><rss><channel /></rss>',
              metadata: {
                sourceURL: requestedUrl,
                statusCode: 200,
                contentType: "application/rss+xml",
              },
            },
          }),
          { status: 200 },
        ),
    );

    await expect(
      fetchFirecrawlPage(requestedUrl, {
        apiKey: "fc-test-secret",
        fetchImpl,
        outputFormat: "rawHtml",
        requireReportedFinalUrl: true,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: "Firecrawl did not report the final source URL.",
    });
  });

  it("returns clear HTTP errors without exposing the API key", async () => {
    const apiKey = "fc-sensitive-secret";
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: `Authorization ${apiKey} was rejected`,
          }),
          { status: 401 },
        ),
    );

    let caught: unknown;
    try {
      await fetchFirecrawlPage("https://example.com", {
        apiKey,
        fetchImpl,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FirecrawlRestError);
    expect(caught).toMatchObject({
      code: "HTTP_ERROR",
      status: 401,
    });
    expect((caught as Error).message).toContain("HTTP 401");
    expect((caught as Error).message).not.toContain(apiKey);
    expect((caught as Error).message).toContain("[redacted]");
  });

  it("fails before making a request when credentials are missing", async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchFirecrawlPage("https://example.com", {
        apiKey: "",
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "MISSING_API_KEY",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
