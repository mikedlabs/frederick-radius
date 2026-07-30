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
});
