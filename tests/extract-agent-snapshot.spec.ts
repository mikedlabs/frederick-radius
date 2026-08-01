import { afterEach, describe, expect, it, vi } from "vitest";

const playwrightMock = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("@playwright/test", () => ({
  chromium: { launch: playwrightMock.launch },
}));

import {
  fetchPageSnapshot,
  getFirecrawlFallbackUsage,
  resetFirecrawlFallbackUsage,
} from "../scripts/lib/extract-agent";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  playwrightMock.launch.mockReset();
  resetFirecrawlFallbackUsage();
});

describe("fetchPageSnapshot", () => {
  it("uses Playwright before considering Firecrawl for render sources", async () => {
    vi.stubEnv("FIRECRAWL_FETCH_FALLBACK", "1");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-secret");
    const target = "https://example.com/rendered-events";
    const close = vi.fn();
    playwrightMock.launch.mockResolvedValue({
      newPage: vi.fn(async () => ({
        goto: vi.fn(),
        waitForTimeout: vi.fn(),
        innerText: vi.fn(async () => "Rendered event calendar"),
        url: vi.fn(() => target),
        locator: vi.fn(() => ({
          evaluateAll: vi.fn(async () => []),
        })),
      })),
      close,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPageSnapshot(target, { render: true }),
    ).resolves.toMatchObject({
      text: "Rendered event calendar",
      requestedUrl: target,
      finalUrl: target,
    });
    expect(playwrightMock.launch).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(getFirecrawlFallbackUsage().attempted).toBe(0);
  });

  it("returns clean text and anchors resolved against the final redirect URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        url: "https://www.example.com/home",
        text: async () => `
          <html>
            <body>
              <script>ignore me</script>
              <h1>Example Kitchen</h1>
              <a href="/menu">Menu</a>
            </body>
          </html>
        `,
      })),
    );

    await expect(
      fetchPageSnapshot("http://example.com", { maxChars: 100 }),
    ).resolves.toEqual({
      text: "Example Kitchen Menu",
      links: [{ url: "https://www.example.com/menu", text: "Menu" }],
      requestedUrl: "http://example.com",
      finalUrl: "https://www.example.com/home",
    });
  });

  it("uses Firecrawl only after a native fetch fails and the fallback is enabled", async () => {
    vi.stubEnv("FIRECRAWL_FETCH_FALLBACK", "1");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-secret");
    const target = "https://example.com/dynamic-events";
    const fetchMock = vi.fn(
      async (input: string | URL | Request): Promise<Response> => {
        if (String(input) !== "https://api.firecrawl.dev/v2/scrape") {
          return new Response("", { status: 403 });
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "# Upcoming\n\nAlive at Five begins at 5 p.m.",
              links: ["https://example.com/events/alive-at-five"],
              metadata: { url: target, statusCode: 200 },
            },
          }),
          { status: 200 },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPageSnapshot(target, { maxChars: 80 })).resolves.toEqual({
      text: "# Upcoming Alive at Five begins at 5 p.m.",
      links: [
        {
          url: "https://example.com/events/alive-at-five",
          text: "",
        },
      ],
      requestedUrl: target,
      finalUrl: target,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a Firecrawl fallback that omits its explicit final URL", async () => {
    vi.stubEnv("FIRECRAWL_FETCH_FALLBACK", "1");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-secret");
    const target = "https://example.com/dynamic-events";
    const fetchMock = vi.fn(
      async (input: string | URL | Request): Promise<Response> => {
        if (String(input) !== "https://api.firecrawl.dev/v2/scrape") {
          return new Response("", { status: 403 });
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "# Upcoming\n\nUnverified provider response",
              metadata: { sourceURL: target, statusCode: 200 },
            },
          }),
          { status: 200 },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPageSnapshot(target)).resolves.toBeNull();
    expect(getFirecrawlFallbackUsage()).toMatchObject({
      attempted: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not spend a Firecrawl request when the fallback switch is off", async () => {
    vi.stubEnv("FIRECRAWL_FETCH_FALLBACK", "0");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-secret");
    const fetchMock = vi.fn(async () => new Response("", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPageSnapshot("https://example.com/blocked"),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-host Firecrawl redirect and preserves the run ceiling", async () => {
    vi.stubEnv("FIRECRAWL_FETCH_FALLBACK", "1");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-secret");
    resetFirecrawlFallbackUsage(1);
    const target = "https://example.com/events";
    const fetchMock = vi.fn(
      async (input: string | URL | Request): Promise<Response> => {
        if (String(input) !== "https://api.firecrawl.dev/v2/scrape") {
          return new Response("", { status: 403 });
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              markdown: "Copied event page",
              metadata: { url: "https://unrelated.example/events" },
            },
          }),
          { status: 200 },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPageSnapshot(target)).resolves.toBeNull();
    await expect(
      fetchPageSnapshot("https://example.com/second"),
    ).resolves.toBeNull();
    expect(getFirecrawlFallbackUsage()).toEqual({
      limit: 1,
      attempted: 1,
      succeeded: 0,
      failed: 1,
      deniedByLimit: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
