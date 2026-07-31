import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  assembleUnifiedEvents: vi.fn(),
  getCachedLiveEvents: vi.fn(),
  withLiveEventFetchSession: vi.fn(),
  syncEventArchiveBatch: vi.fn(),
  startIngestRunStrict: vi.fn(),
  finishIngestRunStrict: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: mocks.assembleUnifiedEvents,
}));
vi.mock("@/lib/integrations/ical-live", () => ({
  getCachedLiveEvents: mocks.getCachedLiveEvents,
  withLiveEventFetchSession: mocks.withLiveEventFetchSession,
}));
vi.mock("@/lib/events/event-archive-batch", () => ({
  syncEventArchiveBatch: mocks.syncEventArchiveBatch,
}));
vi.mock("@/lib/ingest/run-log", () => ({
  startIngestRunStrict: mocks.startIngestRunStrict,
  finishIngestRunStrict: mocks.finishIngestRunStrict,
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
}));

import { GET, maxDuration } from "./route";
import {
  EVENT_ARCHIVE_DB_DEADLINE_MS,
  EVENT_ARCHIVE_HEARTBEAT_BUDGET_MS,
  EVENT_ARCHIVE_SOURCE_BUDGET_MS,
  EVENT_ARCHIVE_WRITE_BUDGET_MS,
} from "./config";

const request = () =>
  new Request("https://frederickradius.app/api/cron/event-archive");

const publicCard = {
  slug: "first-saturday-art-walk-2026-08-01",
  source: "celebrate",
  source_id: "publisher-uid-44",
};

describe("GET /api/cron/event-archive", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.withLiveEventFetchSession.mockImplementation(
      (work: () => Promise<unknown>) => work(),
    );
    mocks.startIngestRunStrict.mockResolvedValue("archive-run-1");
    mocks.finishIngestRunStrict.mockResolvedValue(undefined);
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [publicCard],
      publicEvents: [publicCard],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.getCachedLiveEvents.mockResolvedValue({
      events: [
        { id: "publisher-uid-44", source: "celebrate" },
        { id: "sports-only", source: "ticketmaster" },
      ],
      sources_succeeded: ["celebrate", "ticketmaster"],
      sources_failed: [],
    });
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: true,
      accepted: 1,
      upserted: 1,
      ignoredLifecycleOnly: 0,
      tombstoned: 0,
      batches: 1,
      truncated: false,
      timedOut: false,
      tombstonesEnabled: true,
    });
  });

  it("runs independently with enough headroom to record its final heartbeat", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(60);
    expect(
      EVENT_ARCHIVE_HEARTBEAT_BUDGET_MS * 2
        + EVENT_ARCHIVE_SOURCE_BUDGET_MS
        + EVENT_ARCHIVE_WRITE_BUDGET_MS,
    ).toBeLessThanOrEqual(maxDuration * 1_000 - 10_000);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      phase: "event-archive",
      status: "ok",
      heartbeat_recorded: true,
      archive_attempted: true,
      failures: [],
      sources: {
        succeeded: 2,
        failed: [],
        tombstone_eligible: 1,
      },
      archive: {
        accepted: 1,
        upserted: 1,
        ignored_lifecycle_only: 0,
        complete: true,
        tombstones_enabled: true,
      },
    });
    expect(mocks.withLiveEventFetchSession).toHaveBeenCalledTimes(1);
    expect(mocks.startIngestRunStrict).toHaveBeenCalledWith(
      "event-archive",
      { signal: expect.any(AbortSignal) },
    );
    expect(mocks.assembleUnifiedEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getCachedLiveEvents).toHaveBeenCalledWith(90);
    expect(mocks.syncEventArchiveBatch).toHaveBeenCalledWith(
      [publicCard],
      {
        deadlineMs: EVENT_ARCHIVE_DB_DEADLINE_MS,
        successfulSources: ["celebrate"],
        seenSourceIdentities: [
          { source: "celebrate", source_uid: "publisher-uid-44" },
        ],
      },
    );
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      {
        status: "ok",
        records_in: 1,
        records_upserted: 1,
        records_failed: 0,
        error: null,
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("updates cancelled and postponed identities without archiving other hidden lanes", async () => {
    const scheduled = {
      ...publicCard,
      status: "scheduled",
    };
    const cancelled = {
      slug: "alive-at-five-2026-08-06",
      source: "celebrate",
      source_id: "alive-0806",
      status: "cancelled",
    };
    const postponed = {
      slug: "summer-concert-2026-08-14",
      source: "celebrate",
      source_id: "concert-0814",
      status: "postponed",
    };
    const hiddenMeeting = {
      slug: "planning-commission-2026-08-11",
      source: "city-frederick",
      source_id: "meeting-0811",
      status: "scheduled",
    };
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [scheduled, cancelled, postponed, hiddenMeeting],
      publicEvents: [scheduled],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: true,
      accepted: 3,
      upserted: 1,
      ignoredLifecycleOnly: 2,
      tombstoned: 0,
      batches: 1,
      truncated: false,
      timedOut: false,
      tombstonesEnabled: false,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.syncEventArchiveBatch).toHaveBeenCalledWith(
      [scheduled, cancelled, postponed],
      expect.objectContaining({
        successfulSources: ["celebrate"],
      }),
    );
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      expect.objectContaining({
        status: "ok",
        records_in: 3,
        records_upserted: 1,
        records_failed: 0,
      }),
      { signal: expect.any(AbortSignal) },
    );
    expect(body.archive).toMatchObject({
      accepted: 3,
      upserted: 1,
      ignored_lifecycle_only: 2,
      complete: true,
    });
  });

  it("attempts lifecycle updates even when the public board is empty", async () => {
    const cancelled = {
      slug: "alive-at-five-2026-08-06",
      source: "celebrate",
      source_id: "alive-0806",
      status: "cancelled",
    };
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [cancelled],
      publicEvents: [],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: true,
      accepted: 1,
      upserted: 0,
      ignoredLifecycleOnly: 1,
      tombstoned: 0,
      batches: 1,
      truncated: false,
      timedOut: false,
      tombstonesEnabled: false,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(mocks.syncEventArchiveBatch).toHaveBeenCalledWith(
      [cancelled],
      expect.any(Object),
    );
    expect(body).toMatchObject({
      ok: false,
      status: "error",
      archive_attempted: true,
      failures: ["no-public-events"],
      archive: {
        accepted: 1,
        upserted: 0,
        ignored_lifecycle_only: 1,
        complete: true,
      },
    });
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      expect.objectContaining({
        status: "error",
        records_in: 1,
        records_upserted: 0,
        records_failed: 1,
      }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it("does not touch the archive when its audit heartbeat cannot start", async () => {
    mocks.startIngestRunStrict.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "error",
      heartbeat_recorded: false,
      archive_attempted: false,
      failures: ["heartbeat-start"],
    });
    expect(mocks.assembleUnifiedEvents).not.toHaveBeenCalled();
    expect(mocks.syncEventArchiveBatch).not.toHaveBeenCalled();
    expect(mocks.finishIngestRunStrict).not.toHaveBeenCalled();
  });

  it("returns 503 instead of a false success when no row is archivable", async () => {
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: true,
      accepted: 0,
      upserted: 0,
      ignoredLifecycleOnly: 0,
      tombstoned: 0,
      batches: 0,
      truncated: false,
      timedOut: false,
      tombstonesEnabled: false,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "error",
      heartbeat_recorded: true,
      failures: ["no-archivable-events"],
    });
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      expect.objectContaining({
        status: "error",
        records_upserted: 0,
        records_failed: 1,
        error: "Archive checks failed: no-archivable-events.",
      }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it("keeps partial source evidence conservative and operationally red", async () => {
    mocks.getCachedLiveEvents.mockResolvedValue({
      events: [
        { id: "publisher-uid-44", source: "celebrate" },
        { id: "untrusted-row", source: "county" },
      ],
      sources_succeeded: ["celebrate"],
      sources_failed: ["county"],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "partial",
      failures: ["live-partial"],
      sources: {
        tombstone_eligible: 1,
      },
    });
    expect(mocks.syncEventArchiveBatch).toHaveBeenCalledWith(
      [publicCard],
      expect.objectContaining({
        successfulSources: ["celebrate"],
        seenSourceIdentities: [
          { source: "celebrate", source_uid: "publisher-uid-44" },
        ],
      }),
    );
  });

  it("reports a capped or incomplete write as partial and retryable", async () => {
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: false,
      accepted: 1_200,
      upserted: 1_200,
      ignoredLifecycleOnly: 0,
      tombstoned: 0,
      batches: 6,
      truncated: true,
      timedOut: false,
      tombstonesEnabled: false,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "partial",
      failures: ["archive-truncated", "archive-incomplete"],
      archive: {
        accepted: 1_200,
        upserted: 1_200,
        complete: false,
        truncated: true,
      },
    });
  });

  it("never returns 200 when the success heartbeat cannot finish", async () => {
    mocks.finishIngestRunStrict.mockRejectedValue(
      new Error("heartbeat update failed"),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "ok",
      heartbeat_recorded: false,
      failures: [],
    });
  });

  it("finishes red inside the route limit when source reads hang", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
    mocks.assembleUnifiedEvents.mockImplementation(
      () => new Promise(() => undefined),
    );

    const responsePromise = GET(request());
    await vi.advanceTimersByTimeAsync(
      EVENT_ARCHIVE_SOURCE_BUDGET_MS,
    );
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "error",
      heartbeat_recorded: true,
      archive_attempted: false,
      failures: ["source-read", "no-public-events"],
    });
    expect(mocks.syncEventArchiveBatch).not.toHaveBeenCalled();
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      expect.objectContaining({
        status: "error",
        records_upserted: 0,
        records_failed: 2,
      }),
      { signal: expect.any(AbortSignal) },
    );
  });
});
