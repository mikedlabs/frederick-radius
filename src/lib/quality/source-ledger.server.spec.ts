import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
  feedStatuses: vi.fn(),
  bundledSourceArtifactEvidence: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));
vi.mock("@/lib/integrations/feed-registry", () => ({
  feedStatuses: mocks.feedStatuses,
}));
vi.mock("./source-artifact-evidence", () => ({
  bundledSourceArtifactEvidence:
    mocks.bundledSourceArtifactEvidence,
}));

import { getSourceHealthLedger } from "./source-ledger.server";

function postgresError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe("server source ledger evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSql.mockReturnValue(null);
    mocks.feedStatuses.mockReturnValue({ keyed: [], keyless: [] });
    mocks.bundledSourceArtifactEvidence.mockReturnValue([]);
  });

  it("includes conservative evidence from artifacts in the deployed bundle", async () => {
    mocks.bundledSourceArtifactEvidence.mockReturnValue([
      {
        sourceKey: "venue_event_extraction",
        kind: "artifact",
        attemptedAt: "2026-07-28T09:00:00.000Z",
        outcome: "success",
        succeededAt: "2026-07-28T09:00:00.000Z",
        publishedAt: "2026-07-28T09:00:00.000Z",
        recordCount: 12,
      },
    ]);

    const ledger = await getSourceHealthLedger({
      now: new Date("2026-07-28T12:00:00.000Z"),
    });

    expect(
      ledger.find((row) => row.id === "venue_event_extraction"),
    ).toMatchObject({
      state: "healthy",
      lastPublishedAt: "2026-07-28T09:00:00.000Z",
      recordCount: 12,
      evidenceKinds: ["artifact"],
    });
  });

  it("keeps bounded on-demand availability unverified and preserves real publication gaps", async () => {
    const ledger = await getSourceHealthLedger({
      now: new Date("2026-08-27T12:00:00.000Z"),
    });
    const byId = new Map(ledger.map((row) => [row.id, row]));

    expect(byId.get("fc_address_points_complete")).toMatchObject({
      state: "unknown",
      available: false,
      publicationApplicability: "not_applicable",
      reasonCode: "runtime_validation_missing",
      recommendedAction: "record_runtime_validation",
      lastAttemptAt: null,
      lastSuccessAt: "2026-08-23",
      lastPublishedAt: null,
      evidenceKinds: ["manifest"],
    });
    for (const sourceId of [
      "census_tiger_county_boundary",
      "mdot_chart",
      "nws_alerts",
      "nws_forecast",
      "open_brewery_db",
      "seeclickfix",
    ]) {
      expect(byId.get(sourceId), sourceId).toMatchObject({
        state: "awaiting_publish",
        publicationApplicability: "required",
        reasonCode: "publication_missing",
        lastPublishedAt: null,
      });
    }
  });

  it("accepts only current bounded runtime evidence for the on-demand adapter", async () => {
    const ledger = await getSourceHealthLedger({
      now: new Date("2026-08-27T12:00:00.000Z"),
      currentEvidence: [
        {
          sourceKey: "fc_address_points_complete",
          kind: "runtime_probe",
          attemptedAt: "2026-08-27T11:59:00.000Z",
          outcome: "success",
          succeededAt: "2026-08-27T11:59:00.000Z",
          publishedAt: null,
          recordCount: 1,
        },
      ],
    });

    expect(
      ledger.find((row) => row.id === "fc_address_points_complete"),
    ).toMatchObject({
      state: "healthy",
      available: true,
      publicationApplicability: "not_applicable",
      reasonCode: "publication_not_applicable",
      lastAttemptAt: "2026-08-27T11:59:00.000Z",
      lastSuccessAt: "2026-08-27T11:59:00.000Z",
      lastPublishedAt: null,
      recordCount: 1,
      evidenceKinds: ["manifest", "runtime_probe"],
    });
  });

  it("reads current feed evidence from the compact projection, not full history", async () => {
    const queries: string[] = [];
    const sql = vi.fn((parts: TemplateStringsArray) => {
      const query = parts.join("?");
      queries.push(query);
      if (query.includes("feed_source_health")) {
        return Promise.resolve([
          {
            source: "county",
            taken_at: "2026-07-28T11:55:00.000Z",
            count: 12,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    mocks.getSql.mockReturnValue(sql);

    await getSourceHealthLedger({
      now: new Date("2026-07-28T12:00:00.000Z"),
    });

    const snapshotQuery = queries.find((query) =>
      query.includes("feed_source_health"));
    expect(snapshotQuery).toBeDefined();
    expect(snapshotQuery).not.toContain("FROM feed_snapshots");
    expect(snapshotQuery).not.toContain("JOIN LATERAL");
  });

  it("falls back to legacy snapshot evidence only when the projection is missing", async () => {
    const queries: string[] = [];
    const sql = vi.fn((parts: TemplateStringsArray) => {
      const query = parts.join("?");
      queries.push(query);
      if (query.includes("feed_source_health")) {
        return Promise.reject(
          Object.assign(new Error("query failed"), {
            cause: postgresError(
              "42P01",
              'relation "feed_source_health" does not exist',
            ),
          }),
        );
      }
      if (query.includes("FROM feed_snapshots")) {
        return Promise.resolve([
          {
            source: "county",
            taken_at: "2026-07-28T11:55:00.000Z",
            count: 12,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    mocks.getSql.mockReturnValue(sql);

    const ledger = await getSourceHealthLedger({
      now: new Date("2026-07-28T12:00:00.000Z"),
      strictDatabaseEvidence: true,
    });

    expect(
      queries.some((query) => query.includes("FROM feed_snapshots")),
    ).toBe(true);
    expect(
      ledger.find((row) => row.id === "frederick_county_calendar"),
    ).toMatchObject({
      state: "healthy",
      recordCount: 12,
      evidenceKinds: ["feed_snapshot"],
    });
  });

  it("keeps non-missing-table projection failures strict", async () => {
    const queries: string[] = [];
    const denied = postgresError(
      "42501",
      "permission denied for feed_source_health",
    );
    const sql = vi.fn((parts: TemplateStringsArray) => {
      const query = parts.join("?");
      queries.push(query);
      if (query.includes("feed_source_health")) {
        return Promise.reject(denied);
      }
      return Promise.resolve([]);
    });
    mocks.getSql.mockReturnValue(sql);

    await expect(
      getSourceHealthLedger({ strictDatabaseEvidence: true }),
    ).rejects.toBe(denied);
    expect(
      queries.some((query) => query.includes("FROM feed_snapshots")),
    ).toBe(false);
  });

  it("does not mistake a successful availability probe for published data", async () => {
    const sql = vi.fn((parts: TemplateStringsArray) => {
      const query = parts.join("?");
      if (query.includes("feed_source_health")) return Promise.resolve([]);
      if (query.includes("FROM ingest_runs")) {
        return Promise.resolve([{
          source: "mta_marc_rt",
          latest_started_at: "2026-07-28T11:55:00.000Z",
          latest_ended_at: "2026-07-28T11:55:01.000Z",
          latest_status: "ok",
          latest_records_in: null,
          latest_records_failed: 0,
          latest_error: null,
          operational_started_at: null,
          operational_ended_at: null,
          operational_status: null,
          operational_records_in: null,
          operational_records_failed: null,
          operational_error: null,
          success_started_at: null,
          success_ended_at: null,
          success_records_in: null,
        }]);
      }
      return Promise.resolve([]);
    });
    mocks.getSql.mockReturnValue(sql);

    const ledger = await getSourceHealthLedger({
      now: new Date("2026-07-28T12:00:00.000Z"),
      strictDatabaseEvidence: true,
    });

    expect(ledger.find((row) => row.id === "mta_marc_rt")).toMatchObject({
      state: "unknown",
      reasonCode: "upstream_reachable_validation_missing",
      recommendedAction: "record_validation_or_publication",
      lastObservedAt: "2026-07-28T11:55:00.000Z",
      lastReachabilityAt: "2026-07-28T11:55:00.000Z",
      lastReachabilityOutcome: "success",
      lastPublishedAt: null,
      lastSuccessAt: null,
      recordCount: null,
      evidenceKinds: ["reachability_probe"],
    });
  });

  it("does not let a later reachability success hide a parser failure", async () => {
    const sql = vi.fn((parts: TemplateStringsArray) => {
      const query = parts.join("?");
      if (query.includes("feed_source_health")) return Promise.resolve([]);
      if (query.includes("FROM ingest_runs")) {
        return Promise.resolve([{
          source: "mta_marc_rt",
          latest_started_at: "2026-07-28T11:55:00.000Z",
          latest_ended_at: "2026-07-28T11:55:01.000Z",
          latest_status: "ok",
          latest_records_in: null,
          latest_records_failed: 0,
          latest_error: null,
          operational_started_at: "2026-07-28T11:50:00.000Z",
          operational_ended_at: "2026-07-28T11:50:01.000Z",
          operational_status: "error",
          operational_records_in: 0,
          operational_records_failed: 1,
          operational_error: "Parser rejected the response.",
          success_started_at: "2026-07-28T10:00:00.000Z",
          success_ended_at: "2026-07-28T10:00:01.000Z",
          success_records_in: 12,
        }]);
      }
      return Promise.resolve([]);
    });
    mocks.getSql.mockReturnValue(sql);

    const ledger = await getSourceHealthLedger({
      now: new Date("2026-07-28T12:00:00.000Z"),
      strictDatabaseEvidence: true,
    });

    expect(ledger.find((row) => row.id === "mta_marc_rt")).toMatchObject({
      state: "failing",
      lastAttemptAt: "2026-07-28T11:50:00.000Z",
      lastAttemptOutcome: "failure",
      lastPublishedAt: "2026-07-28T10:00:01.000Z",
      latestError: "Parser rejected the response.",
      evidenceKinds: ["ingest_run", "reachability_probe"],
    });
  });
});
