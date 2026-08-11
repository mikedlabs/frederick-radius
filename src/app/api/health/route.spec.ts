import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCachedPublicHealthSnapshot: vi.fn(),
}));

vi.mock("@/lib/public-health", () => ({
  getCachedPublicHealthSnapshot: mocks.getCachedPublicHealthSnapshot,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
      readiness: { status: "ready" },
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
