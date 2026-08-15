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
  preflightEventArchive: vi.fn(),
  prepareEventArchiveRows: vi.fn(),
  startIngestRunStrict: vi.fn(),
  finishIngestRunStrict: vi.fn(),
  captureMessage: vi.fn(),
  getSql: vi.fn(),
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
  preflightEventArchive: mocks.preflightEventArchive,
  prepareEventArchiveRows: mocks.prepareEventArchiveRows,
}));
vi.mock("@/lib/ingest/run-log", () => ({
  startIngestRunStrict: mocks.startIngestRunStrict,
  finishIngestRunStrict: mocks.finishIngestRunStrict,
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
}));
vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import { GET, maxDuration } from "./route";
import {
  EVENT_ARCHIVE_DB_DEADLINE_MS,
  EVENT_ARCHIVE_HEARTBEAT_BUDGET_MS,
  EVENT_ARCHIVE_PUBLICATION_BUDGET_MS,
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
    mocks.getSql.mockReturnValue(vi.fn(async (
      _parts: TemplateStringsArray,
      ...parameters: unknown[]
    ) => [{
      available_count: 42,
      // Echo whichever parameter is the canary slug array; its position
      // among the timestamp parameters is not part of the contract.
      visible_canaries: parameters.find((value) => Array.isArray(value)) ?? [],
    }]));
    mocks.preflightEventArchive.mockResolvedValue({
      ready: true,
      missing: [],
    });
    mocks.prepareEventArchiveRows.mockImplementation(
      (events: Array<{ slug: string }>) => ({
        rows: events.map((event) => ({ slug: event.slug })),
        truncated: false,
      }),
    );
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
        + EVENT_ARCHIVE_WRITE_BUDGET_MS
        + EVENT_ARCHIVE_PUBLICATION_BUDGET_MS,
    ).toBeLessThanOrEqual(maxDuration * 1_000 - 10_000);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      completed: true,
      healthy: true,
      phase: "event-archive",
      status: "ok",
      heartbeat_recorded: true,
      archive_attempted: true,
      failures: [],
      sources: {
        unified_failed: [],
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
      publication: {
        ok: true,
        available_count: 42,
        expected_canaries: [publicCard.slug],
        visible_canaries: [publicCard.slug],
        missing_canaries: [],
        reason: null,
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

  it("fails before source reads when the archive migration is incomplete", async () => {
    mocks.preflightEventArchive.mockResolvedValue({
      ready: false,
      missing: ["event_tombstones.last_snapshot"],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(mocks.assembleUnifiedEvents).not.toHaveBeenCalled();
    expect(mocks.getCachedLiveEvents).not.toHaveBeenCalled();
    expect(mocks.syncEventArchiveBatch).not.toHaveBeenCalled();
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      {
        status: "error",
        records_in: 0,
        records_upserted: 0,
        records_failed: 1,
        error: "Archive checks failed: schema-not-ready.",
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(body).toMatchObject({
      ok: false,
      status: "error",
      archive_attempted: false,
      failures: ["schema-not-ready"],
      schema: {
        ready: false,
        missing: ["event_tombstones.last_snapshot"],
      },
    });
  });

  it("keeps a bounded database code when the archive schema check rejects", async () => {
    mocks.preflightEventArchive.mockRejectedValue(
      Object.assign(new Error("private connection detail"), {
        code: "57P03",
      }),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      failures: ["schema-not-ready"],
      schema: {
        ready: false,
        check: "rejected",
        error_code: "57P03",
        missing: [],
      },
    });
    expect(JSON.stringify(body)).not.toContain("private connection detail");
    expect(mocks.assembleUnifiedEvents).not.toHaveBeenCalled();
  });

  it("archives every linked civic lane while excluding private bookings", async () => {
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
      title: "Planning Commission Meeting",
      source: "city-frederick",
      source_id: "meeting-0811",
      status: "scheduled",
    };
    const privateBooking = {
      slug: "private-pavilion-rental-2026-08-12",
      title: "Private Pavilion Rental",
      source: "county",
      source_id: "rental-0812",
      status: "scheduled",
    };
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [
        scheduled,
        cancelled,
        postponed,
        hiddenMeeting,
        privateBooking,
      ],
      publicEvents: [scheduled],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: true,
      accepted: 4,
      upserted: 2,
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
      [scheduled, hiddenMeeting, cancelled, postponed],
      expect.objectContaining({
        successfulSources: ["celebrate"],
      }),
    );
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      expect.objectContaining({
        status: "ok",
        records_in: 4,
        records_upserted: 2,
        records_failed: 0,
      }),
      { signal: expect.any(AbortSignal) },
    );
    expect(body.archive).toMatchObject({
      accepted: 4,
      upserted: 2,
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

  it("keeps partial source evidence conservative without failing the completed worker", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      completed: true,
      healthy: false,
      degraded: true,
      retryable: false,
      status: "partial",
      failures: ["live-partial"],
      sources: {
        unified_failed: [],
        failed: ["county"],
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
    expect(warning).toHaveBeenCalledWith(JSON.stringify({
      level: "warn",
      event: "event_archive_provider_partial",
      unified: [],
      live: ["county"],
    }));
    warning.mockRestore();
  });

  it("archives available rows when the unified board reports a degraded source", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [publicCard],
      publicEvents: [publicCard],
      sourceHealth: {
        degraded: true,
        unavailable: ["one publisher"],
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: false,
      status: "partial",
      degraded: true,
      retryable: false,
      failures: ["unified-partial"],
      sources: {
        unified_failed: ["one publisher"],
      },
      archive: {
        accepted: 1,
        upserted: 1,
        records_complete: true,
      },
    });
    expect(warning).toHaveBeenCalledWith(JSON.stringify({
      level: "warn",
      event: "event_archive_provider_partial",
      unified: ["one publisher"],
      live: [],
    }));
    warning.mockRestore();
  });

  it("fails visibly when a completed write is absent from the public archive", async () => {
    mocks.getSql.mockReturnValue(vi.fn(async () => [{
      available_count: 41,
      visible_canaries: [],
    }]));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      completed: false,
      retryable: true,
      status: "partial",
      failures: ["archive-publication"],
      publication: {
        ok: false,
        available_count: 41,
        expected_canaries: [publicCard.slug],
        visible_canaries: [],
        missing_canaries: [publicCard.slug],
        reason: "missing_canary",
      },
    });
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      expect.objectContaining({
        status: "partial",
        records_upserted: 1,
        records_failed: 1,
      }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it("proves canary publication by existence, not by the upcoming window", async () => {
    let sqlText = "";
    mocks.getSql.mockReturnValue(vi.fn(async (
      parts: TemplateStringsArray,
      ...parameters: unknown[]
    ) => {
      sqlText = parts.join("<param>");
      return [{
        available_count: 42,
        visible_canaries: parameters.find((value) => Array.isArray(value)) ?? [],
      }];
    }));

    const response = await GET(request());
    expect(response.status).toBe(200);

    // The canaries are the soonest-starting rows of the written set, which
    // retains in-progress events judged on a clock up to ~19 minutes stale.
    // The count keeps the upcoming window; a canary must qualify by slug
    // alone — the window may only appear OR-ed beside the slug match, never
    // as a top-level condition every row has to pass. Reverting to one
    // shared window re-creates a recurring false archive-publication fatal
    // whenever the soonest event just ended or is zero-duration.
    expect(sqlText).toContain("count(*) filter");
    expect(sqlText).toMatch(
      /where canonical\.event_status = 'scheduled'\s+and tombstone\.canonical_event_id is null\s+and \(\s+canonical\.canonical_slug = any\(/,
    );
    expect(sqlText).toMatch(/any\(<param>::text\[\]\)\s+or \(/);
  });

  it("cancels a publication proof query that misses its deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const never = Object.assign(new Promise<never>(() => undefined), {
      cancel,
    });
    mocks.getSql.mockReturnValue(vi.fn(() => never));

    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(EVENT_ARCHIVE_PUBLICATION_BUDGET_MS + 1);
    const response = await pending;
    const body = await response.json();

    expect(cancel).toHaveBeenCalledOnce();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      failures: ["archive-publication"],
      publication: {
        ok: false,
        reason: "unavailable",
      },
    });
  });

  it("reports cleanup rejection without claiming the event rows were incomplete", async () => {
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: false,
      recordsComplete: true,
      accepted: 1,
      upserted: 1,
      ignoredLifecycleOnly: 0,
      tombstoned: 0,
      batches: 1,
      truncated: false,
      timedOut: false,
      tombstonesEnabled: true,
      failure: {
        stage: "tombstone",
        reason: "rejected",
        code: "40001",
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "partial",
      failures: ["archive-cleanup"],
      archive: {
        accepted: 1,
        upserted: 1,
        records_complete: true,
        complete: false,
        timed_out: false,
        failure: {
          stage: "tombstone",
          reason: "rejected",
          code: "40001",
        },
      },
    });
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      expect.objectContaining({
        status: "partial",
        records_upserted: 1,
        records_failed: 1,
        error: "Archive checks failed: archive-cleanup.",
      }),
      { signal: expect.any(AbortSignal) },
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

  it("records missing archive rows instead of counting only failure labels", async () => {
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: Array.from({ length: 850 }, (_, index) => ({
        ...publicCard,
        slug: `event-${index}`,
        source_id: `publisher-${index}`,
      })),
      publicEvents: Array.from({ length: 850 }, (_, index) => ({
        ...publicCard,
        slug: `event-${index}`,
        source_id: `publisher-${index}`,
      })),
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: false,
      recordsComplete: false,
      accepted: 850,
      upserted: 802,
      ignoredLifecycleOnly: 0,
      tombstoned: 0,
      batches: 4,
      retries: 1,
      truncated: false,
      timedOut: false,
      tombstonesEnabled: false,
      failure: {
        stage: "upsert",
        reason: "rejected",
        code: "40001",
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "partial",
      failures: ["archive-write", "archive-incomplete"],
      archive: {
        accepted: 850,
        upserted: 802,
        retries: 1,
        records_failed: 48,
        failure: { code: "40001" },
      },
    });
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "archive-run-1",
      expect.objectContaining({
        status: "partial",
        records_in: 850,
        records_upserted: 802,
        records_failed: 48,
      }),
      { signal: expect.any(AbortSignal) },
    );
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
