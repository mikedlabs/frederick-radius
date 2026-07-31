import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  runtimeSourceProbeEndpoints: vi.fn(),
  probeFeedEndpoints: vi.fn(),
  aggregateFeedHealthBySource: vi.fn(),
  recordSourceProbeResultsStrict: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/quality/runtime-source-health", () => ({
  runtimeSourceProbeEndpoints: mocks.runtimeSourceProbeEndpoints,
}));
vi.mock("@/lib/quality/feed-health", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/quality/feed-health")
  >();
  return {
    ...actual,
    probeFeedEndpoints: mocks.probeFeedEndpoints,
    aggregateFeedHealthBySource: mocks.aggregateFeedHealthBySource,
  };
});
vi.mock("@/lib/ingest/run-log", () => ({
  recordSourceProbeResultsStrict: mocks.recordSourceProbeResultsStrict,
}));

import { GET, maxDuration } from "./route";

const request = () =>
  new Request("https://frederickradius.app/api/cron/runtime-source-health");

describe("GET /api/cron/runtime-source-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.runtimeSourceProbeEndpoints.mockReturnValue([
      {
        group: "MARC static",
        sourceId: "mta_marc_rt",
        url: "https://example.test/marc-static",
        critical: false,
      },
      {
        group: "MARC realtime",
        sourceId: "mta_marc_rt",
        url: "https://example.test/marc-live",
        critical: false,
      },
      {
        group: "Water",
        sourceId: "usgs_water",
        url: "https://example.test/water",
        critical: false,
      },
    ]);
    mocks.probeFeedEndpoints.mockResolvedValue([
      {
        group: "MARC static",
        sourceId: "mta_marc_rt",
        url: "https://example.test/marc-static",
        status: 200,
        ok: true,
        skipped: false,
        critical: false,
      },
      {
        group: "MARC realtime",
        sourceId: "mta_marc_rt",
        url: "https://example.test/marc-live",
        status: 503,
        ok: false,
        skipped: false,
        critical: false,
      },
      {
        group: "Water",
        sourceId: "usgs_water",
        url: "https://example.test/water",
        status: 200,
        ok: true,
        skipped: false,
        critical: false,
      },
    ]);
    mocks.aggregateFeedHealthBySource.mockReturnValue([
      {
        sourceId: "mta_marc_rt",
        outcome: "failure",
        endpointCount: 2,
        error: "One or more bounded runtime source health probes failed.",
      },
      {
        sourceId: "usgs_water",
        outcome: "success",
        endpointCount: 1,
        error: null,
      },
    ]);
    mocks.recordSourceProbeResultsStrict.mockResolvedValue(2);
  });

  it("persists one completed outcome per source, not per endpoint", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(60);
    expect(response.status).toBe(200);
    expect(mocks.probeFeedEndpoints).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ concurrency: 8, signal: expect.anything() }),
    );
    expect(mocks.recordSourceProbeResultsStrict).toHaveBeenCalledWith(
      [
        {
          sourceSlug: "mta_marc_rt",
          outcome: "failure",
          error: "One or more bounded runtime source health probes failed.",
        },
        {
          sourceSlug: "usgs_water",
          outcome: "success",
          error: null,
        },
      ],
      expect.any(String),
      { signal: expect.anything() },
    );
    expect(body).toMatchObject({
      status: "partial",
      sources: {
        checked: 2,
        healthy: 1,
        failed: ["mta_marc_rt"],
        skipped: [],
      },
      endpoints: { checked: 3 },
      evidence: { expected: 2, persisted: 2 },
    });
  });

  it("does not persist an entirely configuration-gated source", async () => {
    mocks.aggregateFeedHealthBySource.mockReturnValue([{
      sourceId: "nps",
      outcome: "skipped",
      endpointCount: 1,
      error: null,
    }]);
    mocks.recordSourceProbeResultsStrict.mockResolvedValue(0);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.recordSourceProbeResultsStrict).toHaveBeenCalledWith(
      [],
      expect.any(String),
      { signal: expect.anything() },
    );
    expect(body).toMatchObject({
      status: "partial",
      sources: { skipped: ["nps"] },
      evidence: { expected: 0, persisted: 0 },
    });
  });

  it("returns 503 when every configured runtime source is down", async () => {
    mocks.probeFeedEndpoints.mockResolvedValue([
      {
        group: "Traffic",
        sourceId: "traffic",
        url: "https://example.test/traffic",
        status: 503,
        ok: false,
        skipped: false,
        critical: false,
      },
      {
        group: "Weather",
        sourceId: "weather",
        url: "https://example.test/weather",
        status: 503,
        ok: false,
        skipped: false,
        critical: false,
      },
    ]);
    mocks.aggregateFeedHealthBySource.mockReturnValue([
      {
        sourceId: "traffic",
        outcome: "failure",
        endpointCount: 1,
        error: "probe failed",
      },
      {
        sourceId: "weather",
        outcome: "failure",
        endpointCount: 1,
        error: "probe failed",
      },
    ]);
    mocks.recordSourceProbeResultsStrict.mockResolvedValue(2);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "error",
      readiness: {
        blocking: true,
        reason: "systemic-outage",
        configured: 2,
        healthy: 0,
        failed: 2,
      },
    });
  });

  it("fails closed when durable evidence is incomplete", async () => {
    mocks.recordSourceProbeResultsStrict.mockResolvedValue(1);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "error",
      evidence: { expected: 2, persisted: 1 },
    });
  });

  it("returns the auth response before probing", async () => {
    mocks.verifyCronAuth.mockReturnValue(
      new Response("Unauthorized", { status: 401 }),
    );

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.runtimeSourceProbeEndpoints).not.toHaveBeenCalled();
  });
});
