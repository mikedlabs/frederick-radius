import { describe, expect, it, vi } from "vitest";
import type { SourceLedgerRow } from "@/lib/quality/source-ledger";
import {
  createCoalescedPublicHealthLoader,
  getPublicHealthSnapshot,
  type PublicHealthSnapshot,
  summarizePublicSourceHealth,
} from "./public-health";
import type { OperationalReadinessEvidence } from "@/lib/quality/surface-readiness";

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

function source(
  id: string,
  state: SourceLedgerRow["state"],
  publishedAt: string | null,
  manifestStatus = "active",
): SourceLedgerRow {
  return {
    id,
    name: `Source ${id}`,
    owner: null,
    manifestStatus,
    collection: "runtime",
    publicationApplicability: "required",
    configured: true,
    keyless: true,
    missingSettings: [],
    state,
    available: state === "healthy" || state === "healthy_empty",
    reason: "Internal detail that must not become public.",
    reasonCode:
      state === "healthy"
        ? "publication_current"
        : state === "healthy_empty"
          ? "publication_empty_valid"
          : state === "stale"
            ? "publication_stale"
            : state === "failing"
              ? "collection_failed"
              : state === "running"
                ? "collection_running"
                : "source_not_observed",
    recommendedAction: "none",
    lastObservedAt: publishedAt,
    lastReachabilityAt: null,
    lastReachabilityOutcome: null,
    lastAttemptAt: publishedAt,
    lastAttemptOutcome: publishedAt ? "success" : null,
    lastSuccessAt: publishedAt,
    lastPublishedAt: publishedAt,
    recordCount: null,
    latestError: "secret upstream detail",
    freshness: {
      state: publishedAt ? "current" : "unknown",
      ageHours: null,
      maxAgeHours: 3,
    },
    evidenceKinds: [],
  };
}

function snapshot(generatedAt: string): PublicHealthSnapshot {
  return {
    service: "frederick-radius",
    status: "operational",
    generatedAt,
    deployment: { environment: "production", revision: "abcdef012345" },
    database: { status: "reachable", latencyMs: 12 },
    data: {
      status: "current",
      tracked: 1,
      current: 1,
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
      lastPublishedAt: generatedAt,
    },
    readiness: {
      status: "ready",
      migrations: { status: "ready", ...operationalReady.migrations },
      heartbeats: { status: "current", ...operationalReady.heartbeats },
      searchIndex: operationalReady.searchIndex,
      surfaces: {
        today: { status: "ready", reasons: [] },
        ask: { status: "ready", reasons: [] },
        map: { status: "ready", reasons: [] },
        events: { status: "ready", reasons: [] },
      },
    },
  };
}

describe("public health summary", () => {
  it("publishes bounded source counts without names or internal errors", () => {
    const result = summarizePublicSourceHealth([
      source("current", "healthy", "2026-07-28T14:00:00.000Z"),
      source("empty", "healthy_empty", "2026-07-28T15:00:00.000Z"),
      source("late", "stale", "2026-07-27T12:00:00.000Z"),
      source("failed", "failing", null),
      source("unknown", "unknown", null),
      source("planned", "inactive", null, "pending_review"),
    ]);

    expect(result).toEqual({
      status: "degraded",
      tracked: 5,
      current: 2,
      stale: 1,
      attention: 1,
      unknown: 1,
      diagnostics: {
        upstreamUnreachable: 0,
        collectionFailed: 1,
        unconfigured: 0,
        invalidEvidence: 0,
        awaitingPublish: 0,
        requiredEmpty: 0,
        running: 0,
        reachableUnvalidated: 0,
        neverObserved: 1,
      },
      lastPublishedAt: "2026-07-28T15:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Source current|secret upstream|pending_review/,
    );
  });

  it("keeps the legacy unknown count while exposing an actionable breakdown", () => {
    const reachable = source("reachable", "unknown", null);
    reachable.reasonCode = "upstream_reachable_validation_missing";
    reachable.recommendedAction = "record_validation_or_publication";
    reachable.lastObservedAt = "2026-07-28T15:45:00.000Z";
    reachable.lastReachabilityAt = "2026-07-28T15:45:00.000Z";
    reachable.lastReachabilityOutcome = "success";

    const result = summarizePublicSourceHealth([
      reachable,
      source("unobserved", "unknown", null),
      source("working", "running", null),
    ]);

    expect(result).toMatchObject({
      unknown: 3,
      diagnostics: {
        running: 1,
        reachableUnvalidated: 1,
        neverObserved: 1,
      },
    });
  });

  it("returns a compact operational snapshot when dependencies answer", async () => {
    const result = await getPublicHealthSnapshot({
      now: () => new Date("2026-07-28T16:00:00.000Z"),
      environment: "production",
      revision: "abcdef0123456789abcdef",
      probeDatabase: async () => undefined,
      loadSourceLedger: async () => [
        source("current", "healthy", "2026-07-28T15:00:00.000Z"),
      ],
      loadOperationalReadiness: async () => operationalReady,
    });

    expect(result).toMatchObject({
      service: "frederick-radius",
      status: "operational",
      generatedAt: "2026-07-28T16:00:00.000Z",
      deployment: {
        environment: "production",
        revision: "abcdef012345",
      },
      database: { status: "reachable" },
      data: {
        status: "current",
        tracked: 1,
        current: 1,
      },
      readiness: {
        status: "ready",
        migrations: { status: "ready" },
        heartbeats: { status: "current" },
      },
    });
    expect(result.database.latencyMs).toEqual(expect.any(Number));
  });

  it("marks the whole service degraded when source evidence needs attention", async () => {
    const result = await getPublicHealthSnapshot({
      probeDatabase: async () => undefined,
      loadSourceLedger: async () => [
        source("current", "healthy", "2026-07-28T15:00:00.000Z"),
        source("late", "stale", "2026-07-27T12:00:00.000Z"),
      ],
      loadOperationalReadiness: async () => operationalReady,
    });

    expect(result).toMatchObject({
      status: "degraded",
      database: { status: "reachable" },
      data: {
        status: "degraded",
        tracked: 2,
        current: 1,
        stale: 1,
      },
      readiness: {
        status: "partial",
        surfaces: {
          today: { status: "partial" },
          ask: { status: "partial" },
          map: { status: "partial" },
          events: { status: "partial" },
        },
      },
    });
  });

  it("returns before a hung database and does not expose thrown details", async () => {
    const secret = "postgres://user:password@example.internal/database";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await getPublicHealthSnapshot({
      now: () => new Date("2026-07-28T16:00:00.000Z"),
      environment: secret,
      revision: secret,
      databaseDeadlineMs: 5,
      probeDatabase: () => new Promise<void>(() => undefined),
      loadSourceLedger: async () => {
        throw new Error(secret);
      },
      loadOperationalReadiness: async () => operationalReady,
    });

    expect(result).toMatchObject({
      status: "degraded",
      deployment: { environment: "unknown", revision: null },
      database: { status: "timeout", latencyMs: null },
      data: { status: "unavailable", tracked: null },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({
      level: "warn",
      event: "public_health_dependency_failure",
      dependency: "database",
      outcome: "timeout",
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    warn.mockRestore();
  });

  it("keeps internal database and source errors out of the response", async () => {
    const secret = "API_KEY=do-not-leak";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const databaseFailure = await getPublicHealthSnapshot({
      probeDatabase: async () => {
        throw new Error(secret);
      },
      loadSourceLedger: async () => [],
      loadOperationalReadiness: async () => operationalReady,
    });
    expect(databaseFailure.database.status).toBe("unavailable");
    expect(JSON.stringify(databaseFailure)).not.toContain(secret);

    const sourceFailure = await getPublicHealthSnapshot({
      probeDatabase: async () => undefined,
      loadSourceLedger: async () => {
        throw new Error(secret);
      },
      loadOperationalReadiness: async () => operationalReady,
    });
    expect(sourceFailure.data.status).toBe("unavailable");
    expect(JSON.stringify(sourceFailure)).not.toContain(secret);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({
      level: "warn",
      event: "public_health_dependency_failure",
      dependency: "database",
      outcome: "rejected",
    }));
    expect(warn).toHaveBeenCalledWith(JSON.stringify({
      level: "warn",
      event: "public_health_dependency_failure",
      dependency: "source-ledger",
      outcome: "rejected",
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    warn.mockRestore();
  });

  it("fails operational evidence closed without changing the liveness contract", async () => {
    const secret = "postgres://private-operational-check";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await getPublicHealthSnapshot({
      probeDatabase: async () => undefined,
      loadSourceLedger: async () => [
        source("current", "healthy", "2026-07-28T15:00:00.000Z"),
      ],
      loadOperationalReadiness: async () => {
        throw new Error(secret);
      },
    });

    expect(result).toMatchObject({
      status: "degraded",
      readiness: {
        status: "partial",
        migrations: { status: "unknown" },
        heartbeats: { status: "unknown" },
      },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({
      level: "warn",
      event: "public_health_dependency_failure",
      dependency: "operational-readiness",
      outcome: "rejected",
    }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    warn.mockRestore();
  });

  it("coalesces concurrent checks and reuses the completed snapshot", async () => {
    let resolveLoad: ((value: PublicHealthSnapshot) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<PublicHealthSnapshot>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    let nowMs = 1_000;
    const health = createCoalescedPublicHealthLoader(load, {
      nowMs: () => nowMs,
      ttlMs: 30_000,
    });

    const first = health();
    const second = health();
    const third = health();
    expect(load).toHaveBeenCalledTimes(1);

    resolveLoad?.(snapshot("2026-07-28T16:00:00.000Z"));
    const resolved = await Promise.all([first, second, third]);
    expect(resolved.every((value) => value === resolved[0])).toBe(true);

    nowMs += 29_999;
    await expect(health()).resolves.toBe(resolved[0]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refreshes after expiry and caps an oversized TTL at 30 seconds", async () => {
    let nowMs = 5_000;
    const load = vi
      .fn<() => Promise<PublicHealthSnapshot>>()
      .mockResolvedValueOnce(snapshot("2026-07-28T16:00:00.000Z"))
      .mockResolvedValueOnce(snapshot("2026-07-28T16:00:30.000Z"));
    const health = createCoalescedPublicHealthLoader(load, {
      nowMs: () => nowMs,
      ttlMs: 600_000,
    });

    const first = await health();
    nowMs += 29_999;
    await expect(health()).resolves.toBe(first);

    nowMs += 1;
    const refreshed = await health();
    expect(refreshed.generatedAt).toBe("2026-07-28T16:00:30.000Z");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
