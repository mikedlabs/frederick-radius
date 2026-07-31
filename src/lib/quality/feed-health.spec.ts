import { describe, expect, it, vi } from "vitest";
import {
  HIGH_VALUE_SOURCE_ENDPOINTS,
  MARC_SOURCE_ENDPOINTS,
  aggregateFeedHealthBySource,
  probeFeedEndpoint,
  probeFeedEndpoints,
  runtimeSourceProbeGate,
  type FeedHealthEndpoint,
  type FeedHealthResult,
} from "./feed-health";

describe("scheduled feed-health probes", () => {
  it("maps every MARC endpoint to one runtime ledger source", () => {
    expect(MARC_SOURCE_ENDPOINTS).toHaveLength(4);
    expect(
      new Set(MARC_SOURCE_ENDPOINTS.map((endpoint) => endpoint.sourceId)),
    ).toEqual(new Set(["mta_marc_rt"]));
  });

  it("aggregates a multi-endpoint source into one all-or-failed result", () => {
    const healthy: FeedHealthResult[] = MARC_SOURCE_ENDPOINTS.map((endpoint) => ({
      ...endpoint,
      status: 200,
      ok: true,
      skipped: false,
    }));
    expect(aggregateFeedHealthBySource(healthy)).toEqual([{
      sourceId: "mta_marc_rt",
      outcome: "success",
      endpointCount: 4,
      error: null,
    }]);

    healthy[2] = { ...healthy[2], ok: false, status: 503 };
    expect(aggregateFeedHealthBySource(healthy)).toEqual([{
      sourceId: "mta_marc_rt",
      outcome: "failure",
      endpointCount: 4,
      error: "One or more bounded runtime source health probes failed.",
    }]);
  });

  it("keeps fully configuration-gated sources out of failure evidence", () => {
    expect(aggregateFeedHealthBySource([{
      group: "NPS",
      sourceId: "nps",
      url: "https://example.test/nps",
      status: "SKIP",
      ok: false,
      skipped: true,
      critical: false,
    }])).toEqual([{
      sourceId: "nps",
      outcome: "skipped",
      endpointCount: 1,
      error: null,
    }]);
  });

  it("fails an HTTP-only monitor for critical and systemic runtime outages", () => {
    const result = (
      sourceId: string,
      ok: boolean,
      critical = false,
    ): FeedHealthResult => ({
      group: sourceId,
      sourceId,
      url: `https://example.test/${sourceId}`,
      status: ok ? 200 : 503,
      ok,
      skipped: false,
      critical,
    });

    const oneOptionalFailure = [
      result("traffic", false),
      result("weather", true),
      result("events", true),
      result("water", true),
    ];
    expect(
      runtimeSourceProbeGate(
        aggregateFeedHealthBySource(oneOptionalFailure),
        oneOptionalFailure,
      ),
    ).toMatchObject({ blocking: false, healthy: 3, failed: 1 });

    const criticalFailure = [
      result("marc", false, true),
      result("weather", true),
    ];
    expect(
      runtimeSourceProbeGate(
        aggregateFeedHealthBySource(criticalFailure),
        criticalFailure,
      ),
    ).toMatchObject({
      blocking: true,
      reason: "critical-source",
      criticalFailed: ["marc"],
    });

    const systemicFailure = [
      result("traffic", false),
      result("weather", false),
      result("events", false),
      result("water", true),
    ];
    expect(
      runtimeSourceProbeGate(
        aggregateFeedHealthBySource(systemicFailure),
        systemicFailure,
      ),
    ).toMatchObject({
      blocking: true,
      reason: "systemic-outage",
      configured: 4,
      healthy: 1,
      failed: 3,
    });

    const skippedOnly: FeedHealthResult[] = [{
      ...result("nps", false),
      status: "SKIP",
      skipped: true,
    }];
    expect(
      runtimeSourceProbeGate(
        aggregateFeedHealthBySource(skippedOnly),
        skippedOnly,
      ),
    ).toMatchObject({ blocking: false, configured: 0 });
  });

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

  it("does not start queued requests after the route-wide deadline", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const fail = () => reject(new DOMException("aborted", "AbortError"));
        if (signal?.aborted) fail();
        else signal?.addEventListener("abort", fail, { once: true });
      })
    );
    const endpoints: FeedHealthEndpoint[] = Array.from(
      { length: 4 },
      (_, index) => ({
        group: `bounded-${index}`,
        sourceId: `source-${index}`,
        url: `https://example.test/${index}`,
        critical: false,
        method: "GET",
      }),
    );
    endpoints[1] = {
      ...endpoints[1],
      authHeader: { env: "QUEUED_TEST_KEY", name: "x-api-key" },
    };

    const pending = probeFeedEndpoints(endpoints, {
      concurrency: 1,
      env: {},
      fetchImpl,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    controller.abort();
    const results = await pending;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(4);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(results[1]).toMatchObject({
      status: "SKIP",
      skipped: true,
      note: "QUEUED_TEST_KEY is not configured",
    });
  });
});
