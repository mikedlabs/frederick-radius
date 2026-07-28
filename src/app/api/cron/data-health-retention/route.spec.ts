import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  pruneOldSnapshots: vi.fn(),
  prunePushLog: vi.fn(),
  pruneNfcEvents: vi.fn(),
  pruneExpiredReports: vi.fn(),
  startIngestRunStrict: vi.fn(),
  finishIngestRunStrict: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/integrations/feed-snapshot", () => ({
  pruneOldSnapshots: mocks.pruneOldSnapshots,
  SNAPSHOT_PRUNE_BATCH_SIZE: 5_000,
}));
vi.mock("@/lib/push-fanout", () => ({
  prunePushLog: mocks.prunePushLog,
  PUSH_LOG_PRUNE_BATCH_SIZE: 5_000,
}));
vi.mock("@/lib/nfc-retention", () => ({
  pruneNfcEvents: mocks.pruneNfcEvents,
  NFC_EVENT_PRUNE_BATCH_SIZE: 5_000,
}));
vi.mock("@/lib/loaders/communityReports", () => ({
  pruneExpiredReports: mocks.pruneExpiredReports,
  COMMUNITY_REPORT_PRUNE_BATCH_SIZE: 100,
}));
vi.mock("@/lib/ingest/run-log", () => ({
  startIngestRunStrict: mocks.startIngestRunStrict,
  finishIngestRunStrict: mocks.finishIngestRunStrict,
}));

import { GET, maxDuration } from "./route";

const request = () =>
  new Request("https://frederickradius.app/api/cron/data-health-retention");

describe("GET /api/cron/data-health-retention", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATA_RETENTION_PRUNE", "0");
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.startIngestRunStrict.mockResolvedValue("retention-run");
    mocks.finishIngestRunStrict.mockResolvedValue(undefined);
    mocks.pruneOldSnapshots.mockResolvedValue(4);
    mocks.prunePushLog.mockResolvedValue(3);
    mocks.pruneNfcEvents.mockResolvedValue(2);
    mocks.pruneExpiredReports.mockResolvedValue(1);
  });

  it("is inert unless deletion is explicitly enabled", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(60);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      phase: "retention",
      enabled: false,
      deletion_attempted: false,
    });
    expect(mocks.startIngestRunStrict).not.toHaveBeenCalled();
    expect(mocks.pruneOldSnapshots).not.toHaveBeenCalled();
    expect(mocks.prunePushLog).not.toHaveBeenCalled();
    expect(mocks.pruneNfcEvents).not.toHaveBeenCalled();
    expect(mocks.pruneExpiredReports).not.toHaveBeenCalled();
  });

  it("runs bounded, row-capped retention only when enabled", async () => {
    vi.stubEnv("DATA_RETENTION_PRUNE", "1");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.pruneOldSnapshots).toHaveBeenCalledWith(90, 5_000, 5_000);
    expect(mocks.prunePushLog).toHaveBeenCalledWith(90, 5_000, 5_000);
    expect(mocks.pruneNfcEvents).toHaveBeenCalledWith(90, 5_000, 5_000);
    expect(mocks.pruneExpiredReports).toHaveBeenCalledWith(1, 100, 5_000);
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "retention-run",
      expect.objectContaining({
        status: "ok",
        records_in: 4,
        records_upserted: 10,
        records_failed: 0,
      }),
    );
    expect(body).toMatchObject({
      phase: "retention",
      enabled: true,
      deletion_attempted: true,
      status: "ok",
      heartbeat_recorded: true,
      retention_days: 90,
      work_budget_ms: 42_000,
      statement_timeout_ms: 5_000,
      caps: {
        feed_snapshots: 5_000,
        push_log: 5_000,
        nfc_events: 5_000,
        community_reports: 100,
      },
      results: {
        feed_snapshots: { status: "ok", deleted: 4 },
        push_log: { status: "ok", deleted: 3 },
        nfc_events: { status: "ok", deleted: 2 },
        community_reports: { status: "ok", deleted: 1 },
      },
    });
  });

  it("never queues a later delete before the current bounded batch settles", async () => {
    vi.stubEnv("DATA_RETENTION_PRUNE", "1");
    let releaseSnapshots: ((value: number) => void) | undefined;
    mocks.pruneOldSnapshots.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          releaseSnapshots = resolve;
        }),
    );

    const responsePromise = GET(request());
    await vi.waitFor(() => {
      expect(mocks.pruneOldSnapshots).toHaveBeenCalledTimes(1);
    });
    expect(mocks.prunePushLog).not.toHaveBeenCalled();
    expect(mocks.pruneNfcEvents).not.toHaveBeenCalled();
    expect(mocks.pruneExpiredReports).not.toHaveBeenCalled();

    releaseSnapshots?.(4);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(mocks.prunePushLog).toHaveBeenCalledTimes(1);
    expect(mocks.pruneNfcEvents).toHaveBeenCalledTimes(1);
    expect(mocks.pruneExpiredReports).toHaveBeenCalledTimes(1);
  });

  it("does not start a delete after the shared work budget is exhausted", async () => {
    vi.stubEnv("DATA_RETENTION_PRUNE", "1");
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValue(50_000);

    try {
      const response = await GET(request());
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        deletion_attempted: false,
        tasks_attempted: 0,
        results: {
          feed_snapshots: { status: "not_started" },
          push_log: { status: "not_started" },
          nfc_events: { status: "not_started" },
          community_reports: { status: "not_started" },
        },
      });
      expect(mocks.pruneOldSnapshots).not.toHaveBeenCalled();
      expect(mocks.prunePushLog).not.toHaveBeenCalled();
      expect(mocks.pruneNfcEvents).not.toHaveBeenCalled();
      expect(mocks.pruneExpiredReports).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it("does not attempt deletion when its audit heartbeat cannot start", async () => {
    vi.stubEnv("DATA_RETENTION_PRUNE", "1");
    mocks.startIngestRunStrict.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      enabled: true,
      deletion_attempted: false,
      status: "error",
      heartbeat_recorded: false,
    });
    expect(mocks.pruneOldSnapshots).not.toHaveBeenCalled();
    expect(mocks.prunePushLog).not.toHaveBeenCalled();
    expect(mocks.pruneNfcEvents).not.toHaveBeenCalled();
    expect(mocks.pruneExpiredReports).not.toHaveBeenCalled();
  });

  it("fails closed without exposing a retention helper error", async () => {
    vi.stubEnv("DATA_RETENTION_PRUNE", "1");
    mocks.prunePushLog.mockRejectedValue(
      new Error("postgres://user:secret@example.invalid/database"),
    );

    const response = await GET(request());
    const bodyText = await response.text();

    expect(response.status).toBe(503);
    expect(bodyText).not.toContain("user:secret");
    expect(bodyText).toContain('"push_log":{"status":"rejected"}');
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "retention-run",
      expect.objectContaining({
        status: "error",
        records_failed: 1,
        error: "Retention tasks failed: push_log.",
      }),
    );
  });
});
