import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApifyRestError,
  fetchApifyPage,
  redactApifySecrets,
} from "../scripts/lib/apify-rest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function succeededRun(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: "runABC123",
      status: "SUCCEEDED",
      defaultDatasetId: "datasetABC123",
      usageTotalUsd: 0.007,
      ...overrides,
    },
  };
}

describe("fetchApifyPage", () => {
  it("uses bearer auth and an immutable one-page, low-cost Actor input", async () => {
    const token = "apify_api_test_secret";
    const sourceUrl = "https://example.com/events";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(succeededRun(), 201))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            url: sourceUrl,
            markdown:
              "# Events\n\n[First Friday](https://example.com/events/first-friday)",
            crawl: { loadedUrl: sourceUrl, httpStatusCode: 200 },
            metadata: { title: "Events" },
          },
        ]),
      );

    const snapshot = await fetchApifyPage(sourceUrl, {
      token,
      fetchImpl,
    });

    expect(snapshot).toMatchObject({
      requestedUrl: sourceUrl,
      finalUrl: sourceUrl,
      runId: "runABC123",
      datasetId: "datasetABC123",
      usageTotalUsd: 0.007,
      links: ["https://example.com/events/first-friday"],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [runUrl, runInit] = fetchImpl.mock.calls[0]!;
    const parsedRunUrl = new URL(String(runUrl));
    expect(parsedRunUrl.pathname).toBe(
      "/v2/actors/apify~website-content-crawler/runs",
    );
    expect(parsedRunUrl.searchParams.get("token")).toBeNull();
    expect(parsedRunUrl.searchParams.get("timeout")).toBe("180");
    expect(parsedRunUrl.searchParams.get("maxTotalChargeUsd")).toBe("0.25");
    expect(parsedRunUrl.searchParams.get("waitForFinish")).toBe("60");
    expect(parsedRunUrl.searchParams.get("forcePermissionLevel")).toBe(
      "LIMITED_PERMISSIONS",
    );
    expect(runInit).toMatchObject({ method: "POST" });
    expect(runInit?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    });
    const input = JSON.parse(String(runInit?.body)) as Record<string, unknown>;
    expect(input).toMatchObject({
      startUrls: [{ url: sourceUrl }],
      crawlerType: "playwright:adaptive",
      maxCrawlDepth: 0,
      maxCrawlPages: 1,
      maxResults: 1,
      useSitemaps: false,
      useLlmsTxt: false,
      respectRobotsTxtFile: true,
      blockMedia: true,
      saveMarkdown: true,
      saveHtmlAsFile: false,
      saveScreenshots: false,
      summarize: false,
    });
    expect(JSON.stringify(input)).not.toContain(token);

    const [datasetUrl, datasetInit] = fetchImpl.mock.calls[1]!;
    const parsedDatasetUrl = new URL(String(datasetUrl));
    expect(parsedDatasetUrl.pathname).toBe(
      "/v2/datasets/datasetABC123/items",
    );
    expect(parsedDatasetUrl.searchParams.get("limit")).toBe("1");
    expect(parsedDatasetUrl.searchParams.get("clean")).toBe("1");
    expect(String(datasetUrl)).not.toContain(token);
    expect(datasetInit?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    });
  });

  it("polls the exact run until it succeeds, then reads its dataset", async () => {
    const sourceUrl = "https://example.com/calendar";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: "runABC123",
            status: "RUNNING",
            defaultDatasetId: "datasetABC123",
          },
        }, 201),
      )
      .mockResolvedValueOnce(jsonResponse(succeededRun()))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            markdown: "# Calendar\n\nJuly 31 at 7 p.m.",
            crawl: { loadedUrl: sourceUrl, httpStatusCode: 200 },
          },
        ]),
      );

    await expect(
      fetchApifyPage(sourceUrl, { token: "apify_api_test", fetchImpl }),
    ).resolves.toMatchObject({ finalUrl: sourceUrl });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const pollUrl = new URL(String(fetchImpl.mock.calls[1]?.[0]));
    expect(pollUrl.pathname).toBe("/v2/actor-runs/runABC123");
    expect(pollUrl.searchParams.get("waitForFinish")).toBe("60");
  });

  it("rejects unsafe source URLs before making a provider request", async () => {
    const fetchImpl = vi.fn();
    for (const sourceUrl of [
      "http://example.com/events",
      "https://127.0.0.1/events",
      "https://user:pass@example.com/events",
      "https://example.com/events#private",
      " https://example.com/events",
    ]) {
      await expect(
        fetchApifyPage(sourceUrl, {
          token: "apify_api_test",
          fetchImpl,
        }),
      ).rejects.toMatchObject({ code: "INVALID_URL" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires a token before starting the Actor", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchApifyPage("https://example.com/events", {
        token: "",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "MISSING_TOKEN" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects attempts to raise the per-run charge or Actor timeout", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchApifyPage("https://example.com/events", {
        token: "apify_api_test",
        maxTotalChargeUsd: 0.26,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    await expect(
      fetchApifyPage("https://example.com/events", {
        token: "apify_api_test",
        actorTimeoutSeconds: 181,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires an explicit public final loaded URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(succeededRun(), 201))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            markdown: "# Events",
            crawl: { loadedUrl: "http://127.0.0.1/private" },
          },
        ]),
      );

    await expect(
      fetchApifyPage("https://example.com/events", {
        token: "apify_api_test",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("fails on empty, multiple, or malformed crawler results", async () => {
    for (const payload of [
      [],
      [
        { markdown: "one", crawl: { loadedUrl: "https://example.com" } },
        { markdown: "two", crawl: { loadedUrl: "https://example.com" } },
      ],
      [{ markdown: "", crawl: { loadedUrl: "https://example.com" } }],
      [{ markdown: "content" }],
    ]) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(succeededRun(), 201))
        .mockResolvedValueOnce(jsonResponse(payload));
      await expect(
        fetchApifyPage("https://example.com", {
          token: "apify_api_test",
          fetchImpl,
        }),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("reports terminal Actor failure without exposing the token", async () => {
    const token = "apify_api_sensitive_value";
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          data: {
            id: "runABC123",
            status: "FAILED",
            statusMessage: `Authorization ${token} was rejected`,
            defaultDatasetId: "datasetABC123",
          },
        },
        201,
      ),
    );

    let caught: unknown;
    try {
      await fetchApifyPage("https://example.com", { token, fetchImpl });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApifyRestError);
    expect(caught).toMatchObject({ code: "ACTOR_FAILED" });
    expect((caught as Error).message).toContain("[redacted]");
    expect((caught as Error).message).not.toContain(token);
  });

  it("bounds provider responses before parsing", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("{}", {
        status: 201,
        headers: { "content-length": "100" },
      }),
    );
    await expect(
      fetchApifyPage("https://example.com", {
        token: "apify_api_test",
        fetchImpl,
        maxResponseBytes: 10,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("redacts exact and token-shaped values", () => {
    expect(
      redactApifySecrets(
        "first apify_api_exact_secret second apify_api_other_secret",
        "apify_api_exact_secret",
      ),
    ).toBe("first [redacted] second [redacted]");
  });
});
