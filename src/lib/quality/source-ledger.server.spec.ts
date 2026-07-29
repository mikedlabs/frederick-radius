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
});
