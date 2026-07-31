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
  getLiveEvents: vi.fn(),
  getAnomalies: vi.fn(),
  hydrateSnapshotsStrict: vi.fn(),
  persistCurrentSnapshotsStrict: vi.fn(),
  consumeFeedMetrics: vi.fn(),
  liveSourceAnomalies: vi.fn(),
  startIngestRunStrict: vi.fn(),
  finishIngestRunStrict: vi.fn(),
  recordSourceProbeFailuresStrict: vi.fn(),
}));

vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/integrations/ical-live", () => ({
  getLiveEvents: mocks.getLiveEvents,
}));
vi.mock("@/lib/integrations/feed-snapshot", () => ({
  getAnomalies: mocks.getAnomalies,
  hydrateSnapshotsStrict: mocks.hydrateSnapshotsStrict,
  persistCurrentSnapshotsStrict:
    mocks.persistCurrentSnapshotsStrict,
}));
vi.mock("@/lib/integrations/event-schema", () => ({
  consumeFeedMetrics: mocks.consumeFeedMetrics,
}));
vi.mock("@/lib/quality/curated-freshness", () => ({
  liveSourceAnomalies: mocks.liveSourceAnomalies,
}));
vi.mock("@/lib/ingest/run-log", () => ({
  startIngestRunStrict: mocks.startIngestRunStrict,
  finishIngestRunStrict: mocks.finishIngestRunStrict,
  recordSourceProbeFailuresStrict:
    mocks.recordSourceProbeFailuresStrict,
}));

import { GET, maxDuration } from "./route";

const request = () =>
  new Request("https://frederickradius.app/api/cron/data-health-feeds");

describe("GET /api/cron/data-health-feeds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.startIngestRunStrict.mockResolvedValue("feed-run");
    mocks.finishIngestRunStrict.mockResolvedValue(undefined);
    mocks.recordSourceProbeFailuresStrict.mockResolvedValue(0);
    mocks.hydrateSnapshotsStrict.mockResolvedValue(undefined);
    mocks.getLiveEvents.mockResolvedValue({
      events: [],
      sources_succeeded: ["county", "city-frederick"],
      sources_failed: [],
    });
    mocks.persistCurrentSnapshotsStrict.mockResolvedValue(2);
    mocks.getAnomalies.mockReturnValue([]);
    mocks.consumeFeedMetrics.mockReturnValue({});
    mocks.liveSourceAnomalies.mockReturnValue([]);
  });

  it("runs as its own bounded worker and records a completed heartbeat", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(maxDuration).toBe(60);
    expect(response.status).toBe(200);
    expect(mocks.getLiveEvents).toHaveBeenCalledWith(60, {
      includeTicketmaster: false,
      signal: expect.anything(),
      readMode: "probe",
    });
    const signal = mocks.getLiveEvents.mock.calls[0]?.[1]?.signal as
      | AbortSignal
      | undefined;
    expect(signal?.aborted).toBe(false);
    expect(mocks.persistCurrentSnapshotsStrict).toHaveBeenCalledWith([
      "county",
      "city-frederick",
    ]);
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "feed-run",
      expect.objectContaining({
        status: "ok",
        records_in: 2,
        records_upserted: 2,
        records_failed: 0,
      }),
    );
    expect(body).toMatchObject({
      phase: "feeds",
      status: "ok",
      heartbeat_recorded: true,
      snapshots: { expected: 2, persisted: 2 },
      source_failure_evidence: { expected: 0, persisted: 0 },
    });
  });

  it("starts heartbeat, hydration, and provider work together", async () => {
    let finishStart: ((value: string) => void) | undefined;
    let finishHydration: (() => void) | undefined;
    let finishLive:
      | ((value: {
          events: never[];
          sources_succeeded: string[];
          sources_failed: string[];
        }) => void)
      | undefined;
    mocks.startIngestRunStrict.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishStart = resolve;
        }),
    );
    mocks.hydrateSnapshotsStrict.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishHydration = resolve;
        }),
    );
    mocks.getLiveEvents.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLive = resolve;
        }),
    );

    const pending = GET(request());
    await vi.waitFor(() => {
      expect(mocks.startIngestRunStrict).toHaveBeenCalledTimes(1);
      expect(mocks.hydrateSnapshotsStrict).toHaveBeenCalledTimes(1);
      expect(mocks.getLiveEvents).toHaveBeenCalledTimes(1);
    });

    finishStart?.("feed-run");
    finishHydration?.();
    finishLive?.({
      events: [],
      sources_succeeded: ["county", "city-frederick"],
      sources_failed: [],
    });

    const response = await pending;
    expect(response.status).toBe(200);
  });

  it("fails closed when snapshot persistence fails without exposing the error", async () => {
    mocks.persistCurrentSnapshotsStrict.mockRejectedValue(
      new Error("postgres://user:secret@example.invalid/database"),
    );

    const response = await GET(request());
    const bodyText = await response.text();

    expect(response.status).toBe(503);
    expect(bodyText).not.toContain("user:secret");
    expect(bodyText).toContain('"status":"error"');
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "feed-run",
      expect.objectContaining({
        status: "error",
        records_failed: 1,
        error: expect.stringContaining("snapshot-persist"),
      }),
    );
  });

  it("marks upstream source failures partial and non-green", async () => {
    mocks.getLiveEvents.mockResolvedValue({
      events: [],
      sources_succeeded: ["county"],
      sources_failed: ["city-frederick"],
    });
    mocks.persistCurrentSnapshotsStrict.mockResolvedValue(1);
    mocks.recordSourceProbeFailuresStrict.mockResolvedValue(1);
    mocks.liveSourceAnomalies.mockReturnValue([
      {
        source: "city-frederick",
        kind: "live_source_failed",
        detail: "Unavailable.",
      },
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(mocks.recordSourceProbeFailuresStrict).toHaveBeenCalledWith(
      ["city-frederick"],
      expect.any(String),
    );
    expect(body).toMatchObject({
      status: "partial",
      sources: {
        succeeded: 1,
        failed: ["city-frederick"],
      },
      source_failure_evidence: { expected: 1, persisted: 1 },
    });
  });

  it("fails closed when a named source failure cannot reach the ledger", async () => {
    mocks.getLiveEvents.mockResolvedValue({
      events: [],
      sources_succeeded: ["county"],
      sources_failed: ["city-frederick"],
    });
    mocks.persistCurrentSnapshotsStrict.mockResolvedValue(1);
    mocks.recordSourceProbeFailuresStrict.mockResolvedValue(0);

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "feed-run",
      expect.objectContaining({
        status: "error",
        error: expect.stringContaining("source-failure-evidence"),
      }),
    );
  });

  it("does not report green when the live-feed registry returns no sources", async () => {
    mocks.getLiveEvents.mockResolvedValue({
      events: [],
      sources_succeeded: [],
      sources_failed: [],
    });
    mocks.persistCurrentSnapshotsStrict.mockResolvedValue(0);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "error",
      sources: { succeeded: 0, failed: [] },
    });
    expect(mocks.finishIngestRunStrict).toHaveBeenCalledWith(
      "feed-run",
      expect.objectContaining({
        status: "error",
        records_in: 0,
        records_failed: 1,
        error: expect.stringContaining("no-live-sources"),
      }),
    );
  });

  it("aborts live provider work at the route deadline and keeps named failures", async () => {
    vi.useFakeTimers();
    mocks.persistCurrentSnapshotsStrict.mockResolvedValue(0);
    mocks.recordSourceProbeFailuresStrict.mockResolvedValue(1);
    mocks.getLiveEvents.mockImplementation(
      (
        _windowDays: number,
        options: { signal?: AbortSignal },
      ) =>
        new Promise((resolve) => {
          const finish = () =>
            resolve({
              events: [],
              sources_succeeded: [],
              sources_failed: ["county"],
            });
          if (options.signal?.aborted) {
            finish();
          } else {
            options.signal?.addEventListener("abort", finish, {
              once: true,
            });
          }
        }),
    );

    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(15_000);
    const response = await pending;
    const body = await response.json();
    const signal = mocks.getLiveEvents.mock.calls[0]?.[1]?.signal as
      | AbortSignal
      | undefined;

    expect(signal?.aborted).toBe(true);
    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "partial",
      sources: { succeeded: 0, failed: ["county"] },
      source_failure_evidence: { expected: 1, persisted: 1 },
    });
    expect(mocks.recordSourceProbeFailuresStrict).toHaveBeenCalledWith(
      ["county"],
      expect.any(String),
    );
  });
});
