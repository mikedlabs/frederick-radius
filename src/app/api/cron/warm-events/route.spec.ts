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
  sendWarmFailureAlert: vi.fn(),
  syncEventArchiveBatch: vi.fn(),
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
vi.mock("@/lib/integrations/alerts", () => ({
  sendWarmFailureAlert: mocks.sendWarmFailureAlert,
}));
vi.mock("@/lib/events/event-archive-batch", () => ({
  syncEventArchiveBatch: mocks.syncEventArchiveBatch,
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
}));

import {
  EVENT_WARM_BUDGET_MS,
  GET,
  maxDuration,
} from "./route";

const request = () =>
  new Request("https://frederickradius.app/api/cron/warm-events");

describe("GET /api/cron/warm-events", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.withLiveEventFetchSession.mockImplementation(
      (work: () => Promise<unknown>) => work(),
    );
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [{ id: "a" }, { id: "b" }],
      publicEvents: [],
      sourceHealth: { degraded: false, unavailable: [] },
    });
    mocks.getCachedLiveEvents.mockResolvedValue({
      events: [
        { id: "a", source: "celebrate" },
        { id: "b", source: "celebrate" },
        { id: "c", source: "ticketmaster" },
      ],
      sources_succeeded: ["celebrate"],
      sources_failed: [],
    });
    mocks.sendWarmFailureAlert.mockResolvedValue(undefined);
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: true,
      accepted: 0,
      upserted: 0,
      tombstoned: 0,
      batches: 0,
      truncated: false,
      timedOut: false,
      tombstonesEnabled: false,
    });
  });

  it("warms only current event consumers inside one source-fetch session", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(90);
    expect(response.status).toBe(200);
    expect(mocks.withLiveEventFetchSession).toHaveBeenCalledTimes(1);
    expect(mocks.assembleUnifiedEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getCachedLiveEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getCachedLiveEvents).toHaveBeenCalledWith(90);
    expect(mocks.syncEventArchiveBatch).toHaveBeenCalledWith([], {
      deadlineMs: 6_500,
      successfulSources: ["celebrate"],
      seenSourceIdentities: [
        { source: "celebrate", source_uid: "a" },
        { source: "celebrate", source_uid: "b" },
      ],
    });
    expect(body).toMatchObject({
      ok: true,
      warmed: {
        unified: { ok: true, count: 2 },
        live90: { ok: true, count: 3 },
      },
    });
    expect(body.warmed).not.toHaveProperty("live60");
    expect(body).not.toHaveProperty("mapFeeds");
  });

  it("keeps a failed required event warm loud without leaking map work back in", async () => {
    mocks.getCachedLiveEvents.mockRejectedValue(
      new Error("upstream calendar failed"),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      warmed: {
        unified: { ok: true, count: 2 },
        live90: { ok: false, error: "upstream calendar failed" },
      },
    });
    expect(mocks.sendWarmFailureAlert).toHaveBeenCalledWith([
      { cache: "live90", error: "upstream calendar failed" },
    ]);
  });

  it("archives assembled cards and takes tombstone evidence only from the complete source read", async () => {
    const card = {
      slug: "first-saturday-art-walk-2026-08-01",
      source: "celebrate",
      source_id: "publisher-uid-44",
    };
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [card],
      publicEvents: [card],
      sourceHealth: {
        degraded: true,
        unavailable: ["Ticketmaster music"],
      },
    });
    mocks.getCachedLiveEvents.mockResolvedValue({
      events: [
        {
          id: "publisher-uid-44",
          source: "celebrate",
        },
        {
          id: "ticketmaster-sports-only",
          source: "ticketmaster",
        },
      ],
      sources_succeeded: ["celebrate", "ticketmaster"],
      sources_failed: [],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.syncEventArchiveBatch).toHaveBeenCalledWith([card], {
      deadlineMs: 6_500,
      successfulSources: ["celebrate"],
      seenSourceIdentities: [
        {
          source: "celebrate",
          source_uid: "publisher-uid-44",
        },
      ],
    });
  });

  it("reports an incomplete archive sync as an operational failure", async () => {
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: false,
      accepted: 2,
      upserted: 1,
      tombstoned: 0,
      batches: 1,
      truncated: false,
      timedOut: true,
      tombstonesEnabled: false,
    });

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.sendWarmFailureAlert).toHaveBeenCalledWith([
      { cache: "event archive", error: "archive deadline exceeded" },
    ]);
  });

  it("does not fail the cache warm when the bounded archive writes every accepted row", async () => {
    mocks.syncEventArchiveBatch.mockResolvedValue({
      complete: false,
      accepted: 1_200,
      upserted: 1_200,
      tombstoned: 0,
      batches: 6,
      truncated: true,
      timedOut: false,
      tombstonesEnabled: false,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.archive).toMatchObject({
      ok: true,
      accepted: 1_200,
      upserted: 1_200,
      truncated: true,
      tombstonesEnabled: false,
    });
    expect(mocks.sendWarmFailureAlert).not.toHaveBeenCalled();
  });

  it("returns a red summary before the function limit when an event cache hangs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    mocks.assembleUnifiedEvents.mockImplementation(
      () => new Promise(() => undefined),
    );

    const responsePromise = GET(request());
    await vi.advanceTimersByTimeAsync(EVENT_WARM_BUDGET_MS);
    const response = await responsePromise;
    const body = await response.json();

    expect(EVENT_WARM_BUDGET_MS).toBeLessThan(maxDuration * 1_000 - 10_000);
    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      warmed: {
        unified: {
          ok: false,
          error: "event warm phase exceeded its budget",
        },
        live90: { ok: true, count: 3 },
      },
    });
    expect(mocks.sendWarmFailureAlert).toHaveBeenCalledWith([
      {
        cache: "unified",
        error: "event warm phase exceeded its budget",
      },
    ]);
  });
});
