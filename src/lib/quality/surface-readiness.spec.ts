import { describe, expect, it } from "vitest";
import type { DataHealthPhaseRun } from "@/lib/quality/data-health-phases";
import {
  classifyReadinessHeartbeat,
  derivePublicReleaseReadiness,
  type OperationalReadinessEvidence,
} from "./surface-readiness";

const operationalReady: OperationalReadinessEvidence = {
  migrations: {
    hours: "ready",
    search: "ready",
    eventArchive: "ready",
    sourceHealth: "ready",
    dataTruth: "ready",
  },
  heartbeats: {
    feeds: "current",
    eventArchive: "current",
  },
  searchIndex: {
    status: "current",
    expected: 1_570,
    indexed: 1_570,
    current: 1_570,
    missing: 0,
    stale: 0,
    retired: 0,
    embedded: 0,
    lastDocumentChangeAt: "2026-08-24T12:00:00.000Z",
    freshnessBasis: "catalog_content_hash",
  },
};

const run = (
  overrides: Partial<DataHealthPhaseRun> = {},
): DataHealthPhaseRun => ({
  source: "data-health:feeds",
  status: "ok",
  startedAt: "2026-08-10T15:30:00.000Z",
  endedAt: "2026-08-10T15:31:00.000Z",
  recordsIn: 10,
  recordsUpserted: 10,
  recordsFailed: 0,
  error: null,
  ...overrides,
});

describe("public surface release readiness", () => {
  it("keeps every surface ready when schema, workers, and sources are current", () => {
    const result = derivePublicReleaseReadiness({
      database: "reachable",
      data: "current",
      operational: operationalReady,
    });

    expect(result.status).toBe("ready");
    expect(result.migrations.status).toBe("ready");
    expect(result.heartbeats.status).toBe("current");
    expect(Object.values(result.surfaces)).toEqual([
      { status: "ready", reasons: [] },
      { status: "ready", reasons: [] },
      { status: "ready", reasons: [] },
      { status: "ready", reasons: [] },
    ]);
  });

  it("treats optional source degradation as partial, never a release hold", () => {
    const result = derivePublicReleaseReadiness({
      database: "reachable",
      data: "degraded",
      operational: operationalReady,
    });

    expect(result.status).toBe("partial");
    for (const surface of Object.values(result.surfaces)) {
      expect(surface).toEqual({
        status: "partial",
        reasons: ["source_health_degraded"],
      });
    }
  });

  it("holds only the surfaces whose critical schema is explicitly missing", () => {
    const result = derivePublicReleaseReadiness({
      database: "reachable",
      data: "current",
      operational: {
        ...operationalReady,
        migrations: {
          ...operationalReady.migrations,
          hours: "missing",
          search: "missing",
        },
      },
    });

    expect(result.migrations.status).toBe("missing");
    expect(result.surfaces.today).toMatchObject({
      status: "hold",
      reasons: ["hours_schema_missing"],
    });
    expect(result.surfaces.ask).toMatchObject({
      status: "partial",
      reasons: ["search_schema_missing"],
    });
    expect(result.surfaces.map.status).toBe("ready");
    expect(result.surfaces.events.status).toBe("ready");
  });

  it("holds live-data surfaces for a failed feed worker while preserving fallbacks", () => {
    const result = derivePublicReleaseReadiness({
      database: "reachable",
      data: "current",
      operational: {
        ...operationalReady,
        heartbeats: {
          feeds: "failed",
          eventArchive: "current",
        },
      },
    });

    expect(result.heartbeats.status).toBe("degraded");
    expect(result.surfaces.today).toMatchObject({ status: "hold" });
    expect(result.surfaces.events).toMatchObject({ status: "hold" });
    expect(result.surfaces.ask).toMatchObject({ status: "partial" });
    expect(result.surfaces.map).toMatchObject({ status: "partial" });
  });

  it("marks Ask partial for a one-document search gap without holding its catalog fallback", () => {
    const result = derivePublicReleaseReadiness({
      database: "reachable",
      data: "current",
      operational: {
        ...operationalReady,
        searchIndex: {
          ...operationalReady.searchIndex,
          status: "degraded",
          indexed: 1_569,
          current: 1_569,
          missing: 1,
        },
      },
    });

    expect(result.status).toBe("partial");
    expect(result.searchIndex).toMatchObject({
      expected: 1_570,
      indexed: 1_569,
      missing: 1,
      freshnessBasis: "catalog_content_hash",
    });
    expect(result.surfaces.ask).toEqual({
      status: "partial",
      reasons: ["search_index_incomplete"],
    });
    expect(result.surfaces.today.status).toBe("ready");
  });

  it("reports unobserved operational evidence as partial rather than inventing failure", () => {
    const result = derivePublicReleaseReadiness({
      database: "reachable",
      data: "current",
      operational: {
        migrations: {
          hours: "unknown",
          search: "unknown",
          eventArchive: "unknown",
          sourceHealth: "unknown",
          dataTruth: "unknown",
        },
        heartbeats: { feeds: "unknown", eventArchive: "unknown" },
        searchIndex: {
          ...operationalReady.searchIndex,
          status: "unknown",
          expected: null,
          indexed: null,
          current: null,
          missing: null,
          stale: null,
          retired: null,
          embedded: null,
          lastDocumentChangeAt: null,
        },
      },
    });

    expect(result.status).toBe("partial");
    expect(result.migrations.status).toBe("unknown");
    expect(result.heartbeats.status).toBe("unknown");
    expect(Object.values(result.surfaces).every((surface) =>
      surface.status === "partial"
    )).toBe(true);
  });
});

describe("release heartbeat classification", () => {
  const now = new Date("2026-08-10T16:00:00.000Z");
  const maxAgeMs = 2 * 60 * 60_000;

  it("distinguishes current, failed, stale, and missing workers", () => {
    expect(classifyReadinessHeartbeat(run(), now, maxAgeMs)).toBe("current");
    expect(
      classifyReadinessHeartbeat(
        run({ status: "partial", recordsFailed: 1 }),
        now,
        maxAgeMs,
      ),
    ).toBe("failed");
    expect(
      classifyReadinessHeartbeat(
        run({
          status: "partial",
          recordsIn: 10,
          recordsUpserted: 9,
          recordsFailed: 1,
        }),
        now,
        maxAgeMs,
        { allowPartial: true },
      ),
    ).toBe("current");
    expect(
      classifyReadinessHeartbeat(
        run({
          source: "event-archive",
          status: "partial",
          recordsIn: 441,
          recordsUpserted: 423,
          recordsFailed: 2,
        }),
        now,
        maxAgeMs,
        { allowPartial: true },
      ),
    ).toBe("current");
    expect(
      classifyReadinessHeartbeat(
        run({ startedAt: "2026-08-10T12:00:00.000Z" }),
        now,
        maxAgeMs,
      ),
    ).toBe("stale");
    expect(classifyReadinessHeartbeat(null, now, maxAgeMs)).toBe("missing");
  });

  it("uses the last completion during a healthy two-minute cron overlap", () => {
    const completed = run({
      startedAt: "2026-08-10T14:30:00.000Z",
      endedAt: "2026-08-10T14:31:00.000Z",
    });
    const active = run({
      status: "running",
      startedAt: "2026-08-10T15:59:00.000Z",
      endedAt: null,
      recordsIn: 0,
      recordsUpserted: 0,
    });

    expect(
      classifyReadinessHeartbeat(active, now, maxAgeMs, {
        completedRun: completed,
      }),
    ).toBe("current");
    expect(classifyReadinessHeartbeat(active, now, maxAgeMs)).toBe("missing");
  });

  it("fails an active worker only after its two-minute runtime budget", () => {
    const completed = run({
      startedAt: "2026-08-10T14:30:00.000Z",
      endedAt: "2026-08-10T14:31:00.000Z",
    });
    const overrun = run({
      status: "running",
      startedAt: "2026-08-10T15:57:59.000Z",
      endedAt: null,
      recordsIn: 0,
      recordsUpserted: 0,
    });

    expect(
      classifyReadinessHeartbeat(overrun, now, maxAgeMs, {
        completedRun: completed,
      }),
    ).toBe("failed");
  });

  it("preserves stale state when the overlap falls back to an old completion", () => {
    const completed = run({
      startedAt: "2026-08-10T13:00:00.000Z",
      endedAt: "2026-08-10T13:01:00.000Z",
    });
    const active = run({
      status: "running",
      startedAt: "2026-08-10T15:59:30.000Z",
      endedAt: null,
    });

    expect(
      classifyReadinessHeartbeat(active, now, maxAgeMs, {
        completedRun: completed,
      }),
    ).toBe("stale");
  });
});
