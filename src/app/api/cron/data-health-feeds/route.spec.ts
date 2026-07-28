import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

import { GET, maxDuration } from "./route";

const request = () =>
  new Request("https://frederickradius.app/api/cron/data-health-feeds");

describe("GET /api/cron/data-health-feeds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.startIngestRunStrict.mockResolvedValue("feed-run");
    mocks.finishIngestRunStrict.mockResolvedValue(undefined);
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
    });
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
    });
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
    expect(body).toMatchObject({
      status: "partial",
      sources: {
        succeeded: 1,
        failed: ["city-frederick"],
      },
    });
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
});
