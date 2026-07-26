import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  buildDedup: vi.fn(),
  classifyDescription: vi.fn(),
  rankPlaces: vi.fn(),
  hoursCoverage: vi.fn(),
  auditCoordDivergence: vi.fn(),
  getLiveEvents: vi.fn(),
  getAnomalies: vi.fn(),
  hydrateSnapshots: vi.fn(),
  pruneOldSnapshots: vi.fn(),
  prunePushLog: vi.fn(),
  pruneNfcEvents: vi.fn(),
  consumeFeedMetrics: vi.fn(),
  sendAnomalyAlert: vi.fn(),
  computePlaceTrustReport: vi.fn(),
  curatedFreshnessAnomalies: vi.fn(),
  liveSourceAnomalies: vi.fn(),
  pruneExpiredReports: vi.fn(),
  evaluateDbHealth: vi.fn(),
  runTripwires: vi.fn(),
  deliverDataHealthReport: vi.fn(),
  startIngestRun: vi.fn(),
  finishIngestRun: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/data/places", () => ({ PLACES: [] }));
vi.mock("@/data/places-dfp.json", () => ({ default: [] }));
vi.mock("@/lib/dedup", () => ({ buildDedup: mocks.buildDedup }));
vi.mock("@/lib/copy-quality", () => ({
  classifyDescription: mocks.classifyDescription,
}));
vi.mock("@/lib/loaders/places", () => ({
  rankPlaces: mocks.rankPlaces,
  hoursCoverage: mocks.hoursCoverage,
}));
vi.mock("@/lib/coord-audit", () => ({
  auditCoordDivergence: mocks.auditCoordDivergence,
}));
vi.mock("@/lib/integrations/ical-live", () => ({
  getLiveEvents: mocks.getLiveEvents,
}));
vi.mock("@/lib/integrations/feed-snapshot", () => ({
  getAnomalies: mocks.getAnomalies,
  hydrateSnapshots: mocks.hydrateSnapshots,
  pruneOldSnapshots: mocks.pruneOldSnapshots,
}));
vi.mock("@/lib/push-fanout", () => ({
  prunePushLog: mocks.prunePushLog,
}));
vi.mock("@/lib/nfc-retention", () => ({
  pruneNfcEvents: mocks.pruneNfcEvents,
}));
vi.mock("@/lib/integrations/event-schema", () => ({
  consumeFeedMetrics: mocks.consumeFeedMetrics,
}));
vi.mock("@/lib/integrations/alerts", () => ({
  sendAnomalyAlert: mocks.sendAnomalyAlert,
}));
vi.mock("@/lib/quality/trust-report", () => ({
  computePlaceTrustReport: mocks.computePlaceTrustReport,
}));
vi.mock("@/lib/quality/curated-freshness", () => ({
  curatedFreshnessAnomalies: mocks.curatedFreshnessAnomalies,
  liveSourceAnomalies: mocks.liveSourceAnomalies,
}));
vi.mock("@/lib/loaders/communityReports", () => ({
  pruneExpiredReports: mocks.pruneExpiredReports,
}));
vi.mock("@/lib/quality/db-health", () => ({
  evaluateDbHealth: mocks.evaluateDbHealth,
}));
vi.mock("@/lib/quality/tripwires", () => ({
  runTripwires: mocks.runTripwires,
}));
vi.mock("@/lib/integrations/github-alerts", () => ({
  deliverDataHealthReport: mocks.deliverDataHealthReport,
}));
vi.mock("@/lib/ingest/run-log", () => ({
  startIngestRun: mocks.startIngestRun,
  finishIngestRun: mocks.finishIngestRun,
}));

import { GET } from "./route";

function request() {
  return new Request("https://frederickradius.app/api/cron/data-health");
}

describe("GET /api/cron/data-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.buildDedup.mockReturnValue({});
    mocks.rankPlaces.mockReturnValue([]);
    mocks.hoursCoverage.mockReturnValue(0.7);
    mocks.auditCoordDivergence.mockReturnValue([]);
    mocks.getLiveEvents.mockResolvedValue({
      events: [],
      sources_succeeded: [],
      sources_failed: [],
    });
    mocks.getAnomalies.mockReturnValue([]);
    mocks.hydrateSnapshots.mockResolvedValue(undefined);
    mocks.pruneOldSnapshots.mockResolvedValue(0);
    mocks.prunePushLog.mockResolvedValue(0);
    mocks.pruneNfcEvents.mockResolvedValue(0);
    mocks.consumeFeedMetrics.mockReturnValue({});
    mocks.computePlaceTrustReport.mockReturnValue({
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
    mocks.curatedFreshnessAnomalies.mockReturnValue([]);
    mocks.liveSourceAnomalies.mockReturnValue([]);
    mocks.pruneExpiredReports.mockResolvedValue(0);
    mocks.runTripwires.mockResolvedValue({ anomalies: [], checks: [] });
    mocks.deliverDataHealthReport.mockResolvedValue("skipped");
    mocks.startIngestRun.mockResolvedValue(null);
    mocks.finishIngestRun.mockResolvedValue(undefined);
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
});
