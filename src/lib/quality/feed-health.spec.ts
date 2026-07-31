import { describe, expect, it, vi } from "vitest";
import {
  HIGH_VALUE_SOURCE_ENDPOINTS,
  probeFeedEndpoint,
  probeFeedEndpoints,
  type FeedHealthEndpoint,
} from "./feed-health";

describe("scheduled feed-health probes", () => {
  it("covers the high-value active Frederick sources", () => {
    const sourceIds = new Set(
      HIGH_VALUE_SOURCE_ENDPOINTS.map((endpoint) => endpoint.sourceId),
    );

    expect(sourceIds).toEqual(
      new Set([
        "dfp_events",
        "fc_parks_rec",
        "fcpl_libraries",
        "fredscanner",
        "nps",
        "usgs_water",
        "visit_frederick",
      ]),
    );
    expect(
      HIGH_VALUE_SOURCE_ENDPOINTS.every(
        (endpoint) =>
          endpoint.critical === false &&
          endpoint.maxBodyBytes != null &&
          endpoint.maxBodyBytes <= 64 * 1_024,
      ),
    ).toBe(true);
  });

  it("reports keyed NPS as not configured without making a request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const nps = HIGH_VALUE_SOURCE_ENDPOINTS.find(
      (endpoint) => endpoint.sourceId === "nps",
    );
    expect(nps).toBeDefined();

    const result = await probeFeedEndpoint(nps!, {
      env: {},
      fetchImpl,
    });

    expect(result).toMatchObject({
      status: "SKIP",
      ok: false,
      skipped: true,
      critical: false,
      note: "NPS_API_KEY is not configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses a header for a configured NPS key without putting it in results", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("test-only-key");
      return new Response('{"data":[]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const nps = HIGH_VALUE_SOURCE_ENDPOINTS.find(
      (endpoint) => endpoint.sourceId === "nps",
    )!;

    const result = await probeFeedEndpoint(nps, {
      env: { NPS_API_KEY: "test-only-key" },
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(JSON.stringify(result)).not.toContain("test-only-key");
  });

  it("reads only the bounded prefix and cancels the remaining response", async () => {
    let cancelled = false;
    let pulls = 0;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(
          encoder.encode(
            pulls === 1
              ? '{"feed":"ok","payload":"'
              : "x".repeat(1_024),
          ),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    const endpoint: FeedHealthEndpoint = {
      group: "bounded",
      url: "https://example.test/feed",
      critical: false,
      method: "GET",
      maxBodyBytes: 32,
      contentType: /json/i,
      bodyPattern: /^\s*\{/,
    };

    const result = await probeFeedEndpoint(endpoint, {
      fetchImpl: async () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    expect(result.ok).toBe(true);
    expect(cancelled).toBe(true);
    // The WHATWG stream may prefetch one extra chunk before cancellation.
    expect(pulls).toBeLessThanOrEqual(3);
  });

  it("treats a 200 response with the wrong feed shape as down", async () => {
    const endpoint: FeedHealthEndpoint = {
      group: "shape",
      url: "https://example.test/feed",
      critical: false,
      maxBodyBytes: 64,
      contentType: /json/i,
      bodyPattern: /^\s*\[/,
    };

    const result = await probeFeedEndpoint(endpoint, {
      fetchImpl: async () =>
        new Response("<html>soft error</html>", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    expect(result).toMatchObject({
      status: 200,
      ok: false,
      skipped: false,
      note: "expected feed marker not found in first 64 bytes",
    });
  });

  it("caps request fan-out while preserving endpoint order", async () => {
    let active = 0;
    let maxActive = 0;
    const endpoints: FeedHealthEndpoint[] = Array.from(
      { length: 7 },
      (_, index) => ({
        group: `feed-${index}`,
        url: `https://example.test/${index}`,
        critical: false,
        method: "HEAD",
      }),
    );

    const results = await probeFeedEndpoints(endpoints, {
      concurrency: 2,
      fetchImpl: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return new Response(null, { status: 204 });
      },
    });

    expect(maxActive).toBe(2);
    expect(results.map((result) => result.group)).toEqual(
      endpoints.map((endpoint) => endpoint.group),
    );
    expect(results.every((result) => result.ok)).toBe(true);
  });
});
