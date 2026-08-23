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
vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
}));

import {
  GET,
  maxDuration,
} from "./route";
import {
  EVENT_ALERT_BUDGET_MS,
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

    expect(EVENT_WARM_BUDGET_MS + EVENT_ALERT_BUDGET_MS).toBeLessThan(
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
    expect(EVENT_WARM_BUDGET_MS + EVENT_ALERT_BUDGET_MS).toBeLessThan(
      maxDuration * 1_000 - 20_000,
    );
  });
});
