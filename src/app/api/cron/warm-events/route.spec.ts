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
  loadEventArchiveSnapshot: vi.fn(),
  getCachedLiveEvents: vi.fn(),
  withLiveEventFetchSession: vi.fn(),
  sendWarmFailureAlert: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/loaders/unifiedEvents", () => ({
  assembleUnifiedEvents: mocks.assembleUnifiedEvents,
}));
vi.mock("@/lib/loaders/todayEventSnapshot", () => ({
  loadEventArchiveSnapshot: mocks.loadEventArchiveSnapshot,
}));
vi.mock("@/lib/integrations/ical-live", () => ({
  getCachedLiveEvents: mocks.getCachedLiveEvents,
  withLiveEventFetchSession: mocks.withLiveEventFetchSession,
}));
vi.mock("@/lib/integrations/alerts", () => ({
  sendWarmFailureAlert: mocks.sendWarmFailureAlert,
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
}));

import {
  GET,
  maxDuration,
} from "./route";
import {
  EVENT_ALERT_BUDGET_MS,
  EVENT_BROWSE_ARCHIVE_WARM_BUDGET_MS,
  EVENT_WARM_BUDGET_MS,
} from "./config";

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
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [{ slug: "durable-event" }],
      sourceHealth: { degraded: false, unavailable: [], issues: [] },
    });
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
  });

  it("warms only current event consumers inside one source-fetch session", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(90);
    expect(response.status).toBe(200);
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledWith(expect.any(Date), { cache: true });
    expect(mocks.loadEventArchiveSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.assembleUnifiedEvents.mock.invocationCallOrder[0],
    );
    expect(mocks.withLiveEventFetchSession).toHaveBeenCalledTimes(1);
    expect(mocks.assembleUnifiedEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getCachedLiveEvents).toHaveBeenCalledTimes(1);
    expect(mocks.getCachedLiveEvents).toHaveBeenCalledWith(90);
    expect(body).toMatchObject({
      ok: true,
      healthy: true,
      degraded: false,
      source_health: {
        degraded: false,
        unavailable: [],
      },
      warmed: {
        unified: { ok: true, count: 2 },
        live90: { ok: true, count: 3 },
      },
    });
    expect(body.warmed).not.toHaveProperty("live60");
    expect(body).not.toHaveProperty("mapFeeds");
    expect(body).not.toHaveProperty("archive");
  });

  it("checks cron authorization before durable reads or provider work", async () => {
    mocks.verifyCronAuth.mockReturnValue(new Response("unauthorized", { status: 401 }));
    expect((await GET(request())).status).toBe(401);
    expect(mocks.loadEventArchiveSnapshot).not.toHaveBeenCalled();
    expect(mocks.withLiveEventFetchSession).not.toHaveBeenCalled();
    expect(mocks.assembleUnifiedEvents).not.toHaveBeenCalled();
  });

  it("accepts a genuinely empty durable calendar without a failure alert", async () => {
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [], sourceHealth: { degraded: false, unavailable: [], issues: [] },
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).warmed.browseArchive).toEqual({ ok: true, count: 0 });
    expect(mocks.sendWarmFailureAlert).not.toHaveBeenCalled();
  });

  it("does not call a timed-out durable fallback a successful cache warm", async () => {
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [], sourceHealth: {
        degraded: true, unavailable: ["The event schedule is taking longer than expected to load."],
        issues: [{ code: "event_archive_timeout" }],
      },
    });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect((await response.json()).warmed.browseArchive).toEqual({ ok: false, error: "browse archive read unavailable" });
    expect(mocks.sendWarmFailureAlert).toHaveBeenCalledWith([
      { cache: "browseArchive", error: "browse archive read unavailable" },
    ]);
    expect(mocks.assembleUnifiedEvents).toHaveBeenCalledOnce();
  });

  it("bounds a hung durable warm and still performs the existing source session once", async () => {
    vi.useFakeTimers();
    mocks.loadEventArchiveSnapshot.mockImplementation(() => new Promise(() => undefined));
    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(EVENT_BROWSE_ARCHIVE_WARM_BUDGET_MS);
    const response = await pending;
    expect(response.status).toBe(500);
    expect((await response.json()).warmed.browseArchive).toEqual({ ok: false, error: "browse archive warm exceeded its budget" });
    expect(mocks.loadEventArchiveSnapshot).toHaveBeenCalledOnce();
    expect(mocks.withLiveEventFetchSession).toHaveBeenCalledOnce();
    expect(mocks.assembleUnifiedEvents).toHaveBeenCalledOnce();
    expect(mocks.getCachedLiveEvents).toHaveBeenCalledOnce();
  });

  it("keeps stale durable source health separate from available cached rows", async () => {
    mocks.loadEventArchiveSnapshot.mockResolvedValue({
      publicEvents: [{ slug: "durable-event" }],
      sourceHealth: {
        degraded: true, unavailable: ["The event schedule has not been refreshed recently."],
        issues: [{ code: "event_archive_stale" }],
      },
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, healthy: false, degraded: true,
      warmed: { browseArchive: { ok: true, count: 1 } },
      source_health: { degraded: true, unavailable: ["The event schedule has not been refreshed recently."] },
    });
    expect(mocks.sendWarmFailureAlert).not.toHaveBeenCalled();
  });

  it("separates a completed cache warm from degraded publisher coverage", async () => {
    mocks.assembleUnifiedEvents.mockResolvedValue({
      unified: [{ id: "a" }, { id: "b" }],
      publicEvents: [],
      sourceHealth: {
        degraded: true,
        unavailable: ["venue calendars", "county", "county"],
      },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      healthy: false,
      degraded: true,
      source_health: {
        degraded: true,
        unavailable: ["county", "venue calendars"],
      },
      warmed: {
        unified: { ok: true, count: 2 },
        live90: { ok: true, count: 3 },
      },
    });
    expect(mocks.sendWarmFailureAlert).not.toHaveBeenCalled();
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

    expect(EVENT_BROWSE_ARCHIVE_WARM_BUDGET_MS + EVENT_WARM_BUDGET_MS + EVENT_ALERT_BUDGET_MS).toBeLessThan(
      maxDuration * 1_000 - 20_000,
    );
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

  it("returns before the function limit when the fetch session itself hangs", async () => {
    vi.useFakeTimers();
    mocks.withLiveEventFetchSession.mockImplementation(
      () => new Promise(() => undefined),
    );

    const responsePromise = GET(request());
    await vi.advanceTimersByTimeAsync(EVENT_WARM_BUDGET_MS);
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.warmed).toMatchObject({
      unified: {
        ok: false,
        error: "event warm phase exceeded its budget",
      },
      live90: {
        ok: false,
        error: "event warm phase exceeded its budget",
      },
    });
  });

  it("does not let a hung failure alert consume the platform headroom", async () => {
    vi.useFakeTimers();
    mocks.getCachedLiveEvents.mockRejectedValue(
      new Error("upstream calendar failed"),
    );
    mocks.sendWarmFailureAlert.mockImplementation(
      () => new Promise(() => undefined),
    );

    const responsePromise = GET(request());
    await vi.advanceTimersByTimeAsync(EVENT_ALERT_BUDGET_MS);
    const response = await responsePromise;

    expect(response.status).toBe(500);
    expect(EVENT_BROWSE_ARCHIVE_WARM_BUDGET_MS + EVENT_WARM_BUDGET_MS + EVENT_ALERT_BUDGET_MS).toBeLessThan(
      maxDuration * 1_000 - 20_000,
    );
  });
});
