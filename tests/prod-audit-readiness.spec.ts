import { describe, expect, it } from "vitest";
import { publicReadinessGate } from "../scripts/lib/prod-audit-readiness.mjs";

type TestSurface = { status: string; reasons: string[] };
type TestHealthPayload = {
  service: string;
  status: string;
  database: { status: string };
  data: {
    status: string;
    tracked: number | null;
    current: number | null;
    stale: number | null;
    attention: number | null;
    unknown: number | null;
  };
  readiness: {
    status: string;
    migrations: Record<string, string>;
    heartbeats: Record<string, string>;
    surfaces: Record<string, TestSurface>;
  };
};

function payload(): TestHealthPayload {
  return {
    service: "frederick-radius",
    status: "operational",
    database: { status: "reachable" },
    data: {
      status: "current",
      tracked: 10,
      current: 10,
      stale: 0,
      attention: 0,
      unknown: 0,
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
  };
}

describe("production public-readiness canary", () => {
  it("accepts current critical dependencies", () => {
    expect(publicReadinessGate(payload())).toEqual({
      passes: true,
      failures: [],
      partialSurfaces: [],
    });
  });

  it("allows an honest partial surface when critical evidence remains current", () => {
    const input = payload();
    input.status = "degraded";
    input.data.status = "degraded";
    input.data.current = 9;
    input.data.stale = 1;
    input.readiness.status = "partial";
    for (const surface of Object.values(input.readiness.surfaces)) {
      surface.status = "partial";
      surface.reasons = ["source_health_degraded"];
    }

    expect(publicReadinessGate(input)).toEqual({
      passes: true,
      failures: [],
      partialSurfaces: ["today", "ask", "map", "events"],
    });
  });

  it("rejects a release hold and a failed worker heartbeat", () => {
    const input = payload();
    input.readiness.status = "hold";
    input.readiness.heartbeats.status = "degraded";
    input.readiness.heartbeats.feeds = "failed";
    input.readiness.surfaces.today.status = "hold";
    input.readiness.surfaces.today.reasons = ["feed_heartbeat_failed"];

    expect(publicReadinessGate(input)).toMatchObject({
      passes: false,
      failures: expect.arrayContaining([
        'feeds heartbeat is "failed"',
        "today surface is on release hold",
      ]),
    });
  });

  it("fails closed when migration or heartbeat evidence is unknown", () => {
    const input = payload();
    input.readiness.migrations.eventArchive = "unknown";
    input.readiness.heartbeats.eventArchive = "unknown";

    expect(publicReadinessGate(input)).toMatchObject({
      passes: false,
      failures: expect.arrayContaining([
        'eventArchive migration state is "unknown"',
        'eventArchive heartbeat is "unknown"',
      ]),
    });
  });

  it("rejects aggregate states that contradict their detailed evidence", () => {
    const input = payload();
    input.status = "degraded";
    input.readiness.status = "ready";
    input.readiness.migrations.status = "ready";
    input.readiness.migrations.eventArchive = "missing";
    input.readiness.heartbeats.status = "current";
    input.readiness.heartbeats.feeds = "failed";
    input.readiness.surfaces.today.status = "hold";

    expect(publicReadinessGate(input)).toMatchObject({
      passes: false,
      failures: expect.arrayContaining([
        'migration aggregate is "ready"; expected "missing"',
        'heartbeat aggregate is "current"; expected "degraded"',
        'readiness aggregate is "ready"; expected "hold"',
      ]),
    });
  });

  it("rejects a data aggregate that contradicts its source counts", () => {
    const input = payload();
    input.status = "degraded";
    input.data.status = "degraded";
    input.readiness.status = "partial";
    for (const surface of Object.values(input.readiness.surfaces)) {
      surface.status = "partial";
      surface.reasons = ["source_health_degraded"];
    }

    expect(publicReadinessGate(input)).toMatchObject({
      passes: false,
      failures: expect.arrayContaining([
        "data status says degraded but every tracked source is current",
      ]),
    });
  });

  it("rejects ready surfaces while source health is degraded", () => {
    const input = payload();
    input.status = "degraded";
    input.data.status = "degraded";
    input.data.current = 9;
    input.data.stale = 1;

    expect(publicReadinessGate(input)).toMatchObject({
      passes: false,
      failures: expect.arrayContaining([
        "data is degraded but today is marked ready",
      ]),
    });
  });

  it("rejects legacy health payloads that omit readiness", () => {
    expect(
      publicReadinessGate({
        service: "frederick-radius",
        database: { status: "reachable" },
      }),
    ).toEqual({
      passes: false,
      failures: [
        "data status is missing or invalid",
        "release-readiness evidence is missing",
      ],
      partialSurfaces: [],
    });
  });
});
