import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  buildDedup: vi.fn(),
  classifyDescription: vi.fn(),
  auditCoordDivergence: vi.fn(),
  getAnomalies: vi.fn(),
  hydrateSnapshotsStrict: vi.fn(),
  sendAnomalyAlert: vi.fn(),
  computePlaceTrustReport: vi.fn(),
  summarizeHoursRefreshArtifact: vi.fn(),
  hoursRefreshTargetArtifact: vi.fn(),
  hoursRefreshTargetIdentities: vi.fn(),
  curatedFreshnessAnomalies: vi.fn(),
  evaluateDbHealth: vi.fn(),
  getLatestHoursRefreshAt: vi.fn(),
  getRecentIngestRuns: vi.fn(),
  runTripwires: vi.fn(),
  deliverDataHealthReport: vi.fn(),
  startIngestRunStrict: vi.fn(),
  finishIngestRunStrict: vi.fn(),
  readStoredFoodTruckSchedule: vi.fn(),
  evaluateFoodTruckScheduleHealth: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/data/places", () => ({ PLACES: [] }));
vi.mock("@/data/places-dfp.json", () => ({ default: [] }));
vi.mock("@/data/places-client.json", () => ({
  default: [{
    slug: "test-place",
    name: "Test Place",
    short_blurb: "",
    description_reviewed: false,
    google_place_id: "ChIJ-test-place",
  }],
}));
vi.mock("@/data/places-hours-refresh.json", () => ({ default: {} }));
vi.mock("@/lib/dedup", () => ({ buildDedup: mocks.buildDedup }));
vi.mock("@/lib/copy-quality", () => ({
  classifyDescription: mocks.classifyDescription,
}));
vi.mock("@/lib/coord-audit", () => ({
  auditCoordDivergence: mocks.auditCoordDivergence,
}));
vi.mock("@/lib/integrations/feed-snapshot", () => ({
  getAnomalies: mocks.getAnomalies,
  hydrateSnapshotsStrict: mocks.hydrateSnapshotsStrict,
}));
vi.mock("@/lib/integrations/alerts", () => ({
  sendAnomalyAlert: mocks.sendAnomalyAlert,
}));
vi.mock("@/lib/quality/trust-report", () => ({
  computePlaceTrustReport: mocks.computePlaceTrustReport,
}));
vi.mock("@/lib/quality/operator-coverage", () => ({
  summarizeHoursRefreshArtifact: mocks.summarizeHoursRefreshArtifact,
}));
vi.mock("@/lib/loaders/placeRefreshIdentities", () => ({
  hoursRefreshTargetArtifact: mocks.hoursRefreshTargetArtifact,
  hoursRefreshTargetIdentities: mocks.hoursRefreshTargetIdentities,
}));
vi.mock("@/lib/provenance", () => ({
  isGooglePlaceId: (value: unknown) =>
    typeof value === "string" && value.startsWith("ChIJ"),
}));
vi.mock("@/lib/quality/curated-freshness", () => ({
  curatedFreshnessAnomalies: mocks.curatedFreshnessAnomalies,
}));
vi.mock("@/lib/quality/db-health", () => ({
  evaluateDbHealth: mocks.evaluateDbHealth,
  getLatestHoursRefreshAt: mocks.getLatestHoursRefreshAt,
  getRecentIngestRuns: mocks.getRecentIngestRuns,
}));
vi.mock("@/lib/quality/tripwires", () => ({
  runTripwires: mocks.runTripwires,
}));
vi.mock("@/lib/integrations/github-alerts", () => ({
  deliverDataHealthReport: mocks.deliverDataHealthReport,
}));
vi.mock("@/lib/ingest/run-log", () => ({
  startIngestRunStrict: mocks.startIngestRunStrict,
  finishIngestRunStrict: mocks.finishIngestRunStrict,
}));
vi.mock("@/lib/food-trucks/schedule-store", () => ({
  readStoredFoodTruckSchedule: mocks.readStoredFoodTruckSchedule,
}));
vi.mock("@/lib/quality/food-truck-schedule-health", () => ({
  evaluateFoodTruckScheduleHealth:
    mocks.evaluateFoodTruckScheduleHealth,
}));

import { GET } from "./route";

function request() {
  return new Request("https://frederickradius.app/api/cron/data-health");
}

function healthyPhaseRun(source: string) {
  const now = new Date().toISOString();
  return {
    source,
    status: "ok",
    startedAt: now,
    endedAt: now,
    recordsIn: 12,
    recordsUpserted: 12,
    recordsFailed: 0,
    error: null,
    stale: false,
  };
}

describe("GET /api/cron/data-health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATA_RETENTION_PRUNE", "0");
    vi.stubEnv("VERCEL_GITHUB_ALERTS_ENABLED", "1");
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.buildDedup.mockReturnValue({});
    mocks.classifyDescription.mockReturnValue("none");
    mocks.auditCoordDivergence.mockReturnValue([]);
    mocks.getAnomalies.mockReturnValue([]);
    mocks.hydrateSnapshotsStrict.mockResolvedValue(undefined);
    mocks.computePlaceTrustReport.mockReturnValue({
      fresh_hours: {
        fresh_count: 70,
        total_count: 100,
        coverage_pct: 70,
        eligibility_fresh_count: 70,
        eligibility_total_count: 100,
        eligibility_coverage_pct: 70,
        eligibility_scope: "time-sensitive-food-drink",
        target_count: 60,
        target_pct: 60,
        open_now_eligible: true,
        below_gate: false,
        checked_at: "2026-07-27T12:00:00.000Z",
        source: "current-verified-hours",
      },
      provenance: {
        coverage_pct: 100,
        below_gate: false,
        missing_sample: [],
      },
      confidence: {},
      open_assertions: {
        asserting: 0,
        stale_or_missing: 0,
        stale_sample: [],
      },
    });
    mocks.summarizeHoursRefreshArtifact.mockReturnValue({
      expectedGoogleBackedPlaces: 100,
      rows: 24,
      matchedRows: 24,
      unmatchedRows: 0,
      withSchedule: 20,
      freshRefreshRows: 24,
      freshRows: 20,
      staleRows: 0,
      invalidTimestamps: 0,
      coveragePct: 20,
      oldestRefresh: "2026-07-27T08:00:00.000Z",
      newestRefresh: "2026-07-27T08:00:00.000Z",
      cycle: {
        days: 7,
        state: "warming",
        completedDays: 1,
        missingDays: [1, 2, 3, 4, 5, 6],
        underfilledDays: [],
        refreshCoveragePct: 24,
        buckets: [],
      },
    });
    mocks.hoursRefreshTargetArtifact.mockImplementation((artifact) => artifact);
    mocks.hoursRefreshTargetIdentities.mockReturnValue([
      {
        slug: "test-place",
        google_place_id: "ChIJ-test-place",
        category: "restaurant",
      },
    ]);
    mocks.curatedFreshnessAnomalies.mockReturnValue([]);
    mocks.evaluateDbHealth.mockResolvedValue({
      status: "available",
      reason: null,
      anomalies: [],
    });
    mocks.getLatestHoursRefreshAt.mockResolvedValue(
      "2026-07-27T08:00:00.000Z",
    );
    mocks.getRecentIngestRuns.mockResolvedValue([
      healthyPhaseRun("data-health:feeds"),
      healthyPhaseRun("event-archive"),
    ]);
    mocks.runTripwires.mockResolvedValue({ anomalies: [], checks: [] });
    mocks.deliverDataHealthReport.mockResolvedValue("missing_token");
    mocks.startIngestRunStrict.mockResolvedValue("report-run");
    mocks.finishIngestRunStrict.mockResolvedValue(undefined);
    mocks.readStoredFoodTruckSchedule.mockResolvedValue({});
    mocks.evaluateFoodTruckScheduleHealth.mockReturnValue({
      green: true,
      generatedAt: "2026-07-28T08:00:00.000Z",
      ageHours: 1,
      stopCount: 2,
      sourceCount: 1,
      failedSources: [],
      anomalies: [],
    });
  });

  it("returns 503 and names the infrastructure failure when DB health cannot run", async () => {
    const infrastructureAnomaly = {
      source: "database",
      kind: "infrastructure_unavailable",
      detail: "Database health could not be evaluated.",
    };
    mocks.evaluateDbHealth.mockResolvedValue({
      status: "unavailable",
      reason: "not_configured",
      anomalies: [infrastructureAnomaly],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.db_health).toMatchObject({
      status: "unavailable",
      unavailable_reason: "not_configured",
      anomalies: [infrastructureAnomaly],
    });
    expect(body.summary.gates).toContainEqual({
      name: "db-health",
      green: false,
    });
    expect(mocks.deliverDataHealthReport).toHaveBeenCalledWith(
      expect.objectContaining({
        anomalies: expect.arrayContaining([infrastructureAnomaly]),
      }),
    );
  });

  it("returns 200 when DB health was evaluated, even if another DB gate is red", async () => {
    mocks.evaluateDbHealth.mockResolvedValue({
      status: "available",
      reason: null,
      anomalies: [
        {
          source: "unsafe_table",
          kind: "rls_unprotected",
          detail: "RLS is disabled.",
        },
      ],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.db_health.status).toBe("available");
    expect(body.summary.gates).toContainEqual({
      name: "db-health",
      green: false,
    });
  });

  it("surfaces the actionable GitHub delivery result", async () => {
    mocks.deliverDataHealthReport.mockResolvedValue("auth_failed");

    const response = await GET(request());
    const body = await response.json();

    expect(body.summary.github_delivery).toBe("auth_failed");
  });

  it("delegates health issues to the non-expiring Actions channel by default", async () => {
    vi.stubEnv("VERCEL_GITHUB_ALERTS_ENABLED", "");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.github_delivery).toBe("delegated_to_actions");
    expect(mocks.deliverDataHealthReport).not.toHaveBeenCalled();
  });

  it("keeps the headline red when current fresh hours are zero", async () => {
    mocks.computePlaceTrustReport.mockReturnValue({
      fresh_hours: {
        fresh_count: 0,
        total_count: 1_528,
        coverage_pct: 0,
        eligibility_fresh_count: 0,
        eligibility_total_count: 418,
        eligibility_coverage_pct: 0,
        eligibility_scope: "time-sensitive-food-drink",
        target_count: 251,
        target_pct: 60,
        open_now_eligible: false,
        below_gate: true,
        checked_at: "2026-07-27T12:00:00.000Z",
        source: "current-verified-hours",
      },
      provenance: {
        coverage_pct: 100,
        below_gate: false,
        missing_sample: [],
      },
      confidence: {},
      open_assertions: {
        asserting: 0,
        stale_or_missing: 0,
        stale_sample: [],
      },
    });
    mocks.evaluateDbHealth.mockResolvedValue({
      status: "available",
      reason: null,
      anomalies: [],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.headline).toContain("red: open-now-eligibility");
    expect(body.summary.gates).toContainEqual({
      name: "open-now-eligibility",
      green: false,
    });
    expect(body.hours).toMatchObject({
      fresh_count: 0,
      total_count: 1_528,
      coverage_pct: 0,
      eligibility_fresh_count: 0,
      eligibility_total_count: 418,
      eligibility_coverage_pct: 0,
      eligibility_scope: "time-sensitive-food-drink",
      target_count: 251,
      target_pct: 60,
      open_now_eligible: false,
      below_gate: true,
      source: "current-verified-hours",
    });
    expect(body.hours.note).toContain("Stored or historical schedules do not");
  });

  it("reports the committed hours refresh cycle separately from Open Now coverage", async () => {
    mocks.evaluateDbHealth.mockResolvedValue({
      status: "available",
      reason: null,
      anomalies: [],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.summarizeHoursRefreshArtifact).toHaveBeenCalledWith(
      {},
      new Set(["test-place"]),
    );
    expect(body.hours.refresh_cycle).toMatchObject({
      days: 7,
      state: "warming",
      completedDays: 1,
      missingDays: [1, 2, 3, 4, 5, 6],
      refreshCoveragePct: 24,
    });
    expect(body.hours.refresh_rows).toEqual({
      expected: 100,
      fresh: 24,
      with_fresh_schedule: 20,
      invalid_timestamps: 0,
      unmatched: 0,
      oldest_refresh: "2026-07-27T08:00:00.000Z",
      newest_refresh: "2026-07-27T08:00:00.000Z",
    });
    expect(body.hours.publication).toMatchObject({
      green: true,
      state: "current",
      lag_hours: 0,
    });
  });

  it("reports a stalled Google-to-Supabase-to-artifact handoff", async () => {
    mocks.getLatestHoursRefreshAt.mockResolvedValue(
      "2026-07-29T08:00:00.000Z",
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.gates).toContainEqual({
      name: "hours-publication",
      green: false,
    });
    expect(body.hours.publication).toMatchObject({
      green: false,
      state: "stalled",
      source_latest_at: "2026-07-29T08:00:00.000Z",
      artifact_latest_at: "2026-07-27T08:00:00.000Z",
      lag_hours: 48,
    });
    expect(mocks.deliverDataHealthReport).toHaveBeenCalledWith(
      expect.objectContaining({
        anomalies: expect.arrayContaining([
          expect.objectContaining({
            source: "places-hours-refresh-publication",
            kind: "ingest_stale",
          }),
        ]),
      }),
    );
  });

  it("fails the publication gate closed when its Supabase watermark is unavailable", async () => {
    mocks.getLatestHoursRefreshAt.mockRejectedValue(
      new Error("connection unavailable"),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.gates).toContainEqual({
      name: "hours-publication",
      green: false,
    });
    expect(body.hours.publication).toMatchObject({
      green: false,
      state: "unknown",
      source_latest_at: null,
      lag_hours: null,
    });
  });

  it("scores and counts the exact public client catalog", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.places).toBe(1);
    expect(body.copy).toEqual({
      none: 1,
      scraped: 0,
      auto_clean: 0,
      reviewed: 0,
    });
    expect(mocks.classifyDescription).toHaveBeenCalledWith(
      "Test Place",
      "",
      false,
    );
  });

  it("is read-mostly and requires recent completed worker heartbeats", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.gates).toContainEqual({
      name: "feed-worker",
      green: true,
    });
    expect(body.phases.feeds).toMatchObject({
      green: true,
      status: "ok",
      sources_checked: 12,
      snapshots_persisted: 12,
    });
    expect(body.summary.gates).toContainEqual({
      name: "event-archive",
      green: true,
    });
    expect(body.phases.event_archive).toMatchObject({
      green: true,
      status: "ok",
      events_seen: 12,
      events_upserted: 12,
    });
    expect(body.note).toContain("separately scheduled");
  });

  it("returns a completed degraded report when the archive heartbeat is missing", async () => {
    mocks.getRecentIngestRuns.mockResolvedValue([
      healthyPhaseRun("data-health:feeds"),
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toMatchObject({
      status: "degraded",
      degraded: true,
      required_phase_unavailable: true,
    });
    expect(body.summary.gates).toContainEqual({
      name: "event-archive",
      green: false,
    });
    expect(body.phases.event_archive).toMatchObject({
      green: false,
      status: null,
    });
    expect(mocks.deliverDataHealthReport).toHaveBeenCalledWith(
      expect.objectContaining({
        anomalies: expect.arrayContaining([
          expect.objectContaining({
            source: "event-archive",
            kind: "tripwire_failed",
          }),
        ]),
      }),
    );
  });

  it("reports a missing feed-worker heartbeat without failing the reporter", async () => {
    mocks.getRecentIngestRuns.mockResolvedValue([]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.gates).toContainEqual({
      name: "feed-worker",
      green: false,
    });
    expect(body.summary.headline).toContain("feed-worker");
    expect(mocks.deliverDataHealthReport).toHaveBeenCalledWith(
      expect.objectContaining({
        anomalies: expect.arrayContaining([
          expect.objectContaining({
            source: "data-health:feeds",
            kind: "tripwire_failed",
          }),
        ]),
      }),
    );
  });

  it("names controlled feed-worker failures in the delivered report", async () => {
    mocks.getRecentIngestRuns.mockResolvedValue([
      {
        ...healthyPhaseRun("data-health:feeds"),
        status: "partial",
        recordsFailed: 1,
        error: "Live sources failed: city-frederick.",
      },
    ]);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.deliverDataHealthReport).toHaveBeenCalledWith(
      expect.objectContaining({
        anomalies: expect.arrayContaining([
          expect.objectContaining({
            source: "data-health:feeds",
            detail: expect.stringContaining("city-frederick"),
          }),
        ]),
      }),
    );
  });

  it("reads required phase heartbeats before starting DB-heavy checks", async () => {
    await GET(request());

    const phaseReadOrder =
      mocks.getRecentIngestRuns.mock.invocationCallOrder[0];
    expect(phaseReadOrder).toBeLessThan(
      mocks.evaluateDbHealth.mock.invocationCallOrder[0],
    );
    expect(phaseReadOrder).toBeLessThan(
      mocks.runTripwires.mock.invocationCallOrder[0],
    );
    expect(phaseReadOrder).toBeLessThan(
      mocks.readStoredFoodTruckSchedule.mock.invocationCallOrder[0],
    );
  });

  it("requires a fresh retention heartbeat only when deletion is explicitly enabled", async () => {
    vi.stubEnv("DATA_RETENTION_PRUNE", "1");
    mocks.getRecentIngestRuns.mockResolvedValue([
      healthyPhaseRun("data-health:feeds"),
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.phases.retention).toMatchObject({
      enabled: true,
      green: false,
      status: null,
    });
    expect(body.summary.gates).toContainEqual({
      name: "data-retention",
      green: false,
    });
  });

  it("never places internal worker failures in the public JSON", async () => {
    mocks.evaluateDbHealth.mockRejectedValue(
      new Error("postgres://user:secret@example.invalid/database"),
    );

    const response = await GET(request());
    const bodyText = await response.text();

    expect(response.status).toBe(503);
    expect(bodyText).not.toContain("user:secret");
    expect(bodyText).toContain("reporter deadline");
  });

  it("returns 503 when the reporter cannot record its own completion", async () => {
    mocks.finishIngestRunStrict.mockRejectedValue(
      new Error("completion write failed"),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.summary.reporter_heartbeat_recorded).toBe(false);
  });
});
