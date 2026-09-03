import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCachedPublicHealthSnapshot: vi.fn(),
  publicDataSnapshot: vi.fn(),
  publicHoursProductHealth: vi.fn(),
}));

vi.mock("@/lib/public-health", () => ({
  getCachedPublicHealthSnapshot: mocks.getCachedPublicHealthSnapshot,
}));

vi.mock("@/lib/public-data-snapshot", () => ({
  publicDataSnapshot: mocks.publicDataSnapshot,
  publicHoursProductHealth: mocks.publicHoursProductHealth,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.publicDataSnapshot.mockReturnValue({
      schemaVersion: 1,
      dataVersion: `sha256:${"a".repeat(64)}`,
      lastSuccessfulDataPromotion: "2026-08-12T12:00:00Z",
      counts: {},
    });
    mocks.publicHoursProductHealth.mockReturnValue({
      status: "current",
      mode: "active_refresh",
      current: 1_000,
      expected: 1_570,
      coveragePct: 63.7,
      target: 942,
      targetPct: 60,
      checkedAt: "2026-08-27T14:00:00.000Z",
      operatorMessage: null,
    });
  });

  it("returns a non-cacheable public operational snapshot", async () => {
    mocks.getCachedPublicHealthSnapshot.mockResolvedValue({
      service: "frederick-radius",
      status: "operational",
      generatedAt: "2026-07-28T16:00:00.000Z",
      deployment: { environment: "production", revision: "abcdef012345" },
      database: { status: "reachable", latencyMs: 18 },
      data: {
        status: "current",
        tracked: 10,
        current: 10,
        stale: 0,
        attention: 0,
        unknown: 0,
        diagnostics: {
          upstreamUnreachable: 0,
          collectionFailed: 0,
          unconfigured: 0,
          invalidEvidence: 0,
          awaitingPublish: 0,
          requiredEmpty: 0,
          running: 0,
          reachableUnvalidated: 0,
          neverObserved: 0,
        },
        lastPublishedAt: "2026-07-28T15:55:00.000Z",
      },
      readiness: {
        status: "ready",
        migrations: {
          status: "ready",
          hours: "ready",
          search: "ready",
          eventArchive: "ready",
          sourceHealth: "ready",
          dataTruth: "ready",
        },
        heartbeats: {
          status: "current",
          feeds: "current",
          eventArchive: "current",
        },
        surfaces: {
          today: { status: "ready", reasons: [] },
          ask: { status: "ready", reasons: [] },
          map: { status: "ready", reasons: [] },
          events: { status: "ready", reasons: [] },
        },
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, max-age=0",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({
      service: "frederick-radius",
      status: "operational",
      database: { status: "reachable" },
      readiness: {
        status: "ready",
        surfaces: {
          today: { status: "ready", reasons: [] },
          ask: { status: "ready", reasons: [] },
          map: { status: "ready", reasons: [] },
          events: { status: "ready", reasons: [] },
        },
      },
      products: { hours: { status: "current", current: 1_000 } },
      release: { dataVersion: `sha256:${"a".repeat(64)}` },
    });
  });

  it("marks liveness degraded when deployed current-hours coverage is below its gate", async () => {
    mocks.publicHoursProductHealth.mockReturnValue({
      status: "degraded",
      mode: "active_refresh",
      current: 346,
      expected: 1_570,
      coveragePct: 22,
      target: 942,
      targetPct: 60,
      checkedAt: "2026-08-27T14:10:00.000Z",
      operatorMessage: null,
    });
    mocks.getCachedPublicHealthSnapshot.mockResolvedValue({
      service: "frederick-radius",
      status: "operational",
      generatedAt: "2026-08-27T14:10:00.000Z",
      deployment: { environment: "production", revision: "abcdef012345" },
      database: { status: "reachable", latencyMs: 18 },
      data: { status: "current" },
      readiness: { status: "ready" },
    });

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      products: {
        hours: {
          status: "degraded",
          current: 346,
          expected: 1_570,
          coveragePct: 22,
        },
      },
    });
  });

  it("keeps the service operational while paid hours refresh is deliberately held", async () => {
    mocks.publicHoursProductHealth.mockReturnValue({
      status: "policy_hold",
      mode: "policy_hold",
      current: 0,
      expected: 1_570,
      coveragePct: 0,
      target: 942,
      targetPct: 60,
      checkedAt: "2026-09-03T15:43:56.000Z",
      operatorMessage:
        "Paid Google hours refresh is intentionally disabled. Current-hours coverage remains unavailable until an approved replacement source is promoted.",
    });
    mocks.getCachedPublicHealthSnapshot.mockResolvedValue({
      service: "frederick-radius",
      status: "operational",
      generatedAt: "2026-09-03T15:43:56.000Z",
      deployment: { environment: "production", revision: "abcdef012345" },
      database: { status: "reachable", latencyMs: 18 },
      data: { status: "current" },
      readiness: {
        status: "ready",
        surfaces: {
          today: { status: "ready", reasons: [] },
          ask: { status: "ready", reasons: [] },
          map: { status: "ready", reasons: [] },
          events: { status: "ready", reasons: [] },
        },
      },
    });

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      status: "operational",
      readiness: {
        status: "partial",
        surfaces: {
          today: {
            status: "partial",
            reasons: ["current_hours_policy_hold"],
          },
          ask: {
            status: "partial",
            reasons: ["current_hours_policy_hold"],
          },
          map: {
            status: "partial",
            reasons: ["current_hours_policy_hold"],
          },
          events: { status: "ready", reasons: [] },
        },
        capabilities: {
          currentHours: {
            status: "policy_hold",
            affectedSurfaces: ["today", "ask", "map"],
            message: expect.stringContaining(
              "Current-hours coverage remains unavailable",
            ),
          },
        },
      },
      products: {
        hours: {
          status: "policy_hold",
          mode: "policy_hold",
          current: 0,
          expected: 1_570,
        },
      },
    });
  });

  it("keeps liveness at HTTP 200 when release readiness is on hold", async () => {
    mocks.getCachedPublicHealthSnapshot.mockResolvedValue({
      service: "frederick-radius",
      status: "degraded",
      generatedAt: "2026-08-10T16:00:00.000Z",
      deployment: { environment: "production", revision: "abcdef012345" },
      database: { status: "reachable", latencyMs: 18 },
      data: {
        status: "degraded",
        tracked: 10,
        current: 9,
        stale: 1,
        attention: 0,
        unknown: 0,
        diagnostics: null,
        lastPublishedAt: "2026-08-10T15:55:00.000Z",
      },
      readiness: {
        status: "hold",
        migrations: {
          status: "ready",
          hours: "ready",
          search: "ready",
          eventArchive: "ready",
          sourceHealth: "ready",
          dataTruth: "ready",
        },
        heartbeats: {
          status: "degraded",
          feeds: "failed",
          eventArchive: "current",
        },
        surfaces: {
          today: { status: "hold", reasons: ["feed_heartbeat_failed"] },
          ask: { status: "partial", reasons: ["feed_heartbeat_failed"] },
          map: { status: "partial", reasons: ["feed_heartbeat_failed"] },
          events: { status: "hold", reasons: ["feed_heartbeat_failed"] },
        },
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      readiness: { status: "hold" },
    });
  });
});
