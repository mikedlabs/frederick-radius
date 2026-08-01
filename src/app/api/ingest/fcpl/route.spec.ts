import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
  upsertEvent: vi.fn(),
  geocodePending: vi.fn(),
  geocodeLimitForRemaining: vi.fn(),
  fcplMapFeed: vi.fn(),
  verifyCronAuth: vi.fn(),
  revalidateTag: vi.fn(),
  startIngestRun: vi.fn(),
  finishIngestRun: vi.fn(),
  checkEventSchemaReadiness: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/db/client", () => ({ getSql: mocks.getSql }));
vi.mock("@/lib/ingest/upsert", () => ({
  emptyStats: () => ({
    rawInserted: 0,
    rawUpdated: 0,
    rawUnchanged: 0,
    normUpserted: 0,
    unparseableLocations: 0,
  }),
  upsertEvent: mocks.upsertEvent,
}));
vi.mock("@/lib/ingest/geocode", () => ({
  geocodePending: mocks.geocodePending,
  geocodeLimitForRemaining: mocks.geocodeLimitForRemaining,
}));
vi.mock("@/lib/ingest/fcpl", () => ({
  FCPL_SOURCE_DOMAIN: "frederick.librarycalendar.com",
  fcplMapFeed: mocks.fcplMapFeed,
}));
vi.mock("@/lib/ingest/run-log", () => ({
  startIngestRun: mocks.startIngestRun,
  finishIngestRun: mocks.finishIngestRun,
}));
vi.mock("@/lib/ingest/event-schema-readiness", () => ({
  checkEventSchemaReadiness: mocks.checkEventSchemaReadiness,
}));
vi.mock("../_auth", () => ({ verifyCronAuth: mocks.verifyCronAuth }));

import { GET } from "./route";

const HEALTHY_GEOCODE = {
  fromCache: 1,
  fromApi: 0,
  failed: 0,
  seeded: 0,
  revalidated: 2,
  repaired: 0,
  cleared: 0,
  status: "ok",
  budgetStopped: 0,
};

function request(query = "") {
  return new NextRequest(
    `https://frederickradius.app/api/ingest/fcpl${query}`,
  );
}

describe("GET /api/ingest/fcpl geocode budget", () => {
  const sql = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.getSql.mockReturnValue(sql);
    mocks.startIngestRun.mockResolvedValue("run-fcpl");
    mocks.finishIngestRun.mockResolvedValue(undefined);
    mocks.checkEventSchemaReadiness.mockResolvedValue({
      ready: true,
      missing: [],
    });
    mocks.fcplMapFeed.mockReturnValue([
      {
        event: { uid: "library-1" },
        municipality: "Frederick",
        category: "Library",
      },
    ]);
    mocks.upsertEvent.mockResolvedValue(undefined);
    mocks.geocodeLimitForRemaining.mockReturnValue(6);
    mocks.geocodePending.mockResolvedValue(HEALTHY_GEOCODE);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "library-1" }]), { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives a bounded tail from remaining time and passes the deadline through", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(mocks.geocodeLimitForRemaining).toHaveBeenCalledWith(
      expect.any(Number),
      800,
    );
    const remainingMs = mocks.geocodeLimitForRemaining.mock.calls[0][0];
    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThanOrEqual(285_000);
    expect(mocks.geocodePending).toHaveBeenCalledWith(sql, 6, {
      deadlineAt: expect.any(Number),
    });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-fcpl",
      expect.objectContaining({ status: "ok", error: undefined }),
    );
    expect(body.geocode).toEqual(HEALTHY_GEOCODE);
  });

  it("fails before downloading the feed when the event schema is incomplete", async () => {
    mocks.checkEventSchemaReadiness.mockResolvedValue({
      ready: false,
      missing: ["ingested_events.hero_image"],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.fcplMapFeed).not.toHaveBeenCalled();
    expect(mocks.upsertEvent).not.toHaveBeenCalled();
    expect(mocks.geocodePending).not.toHaveBeenCalled();
    expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-fcpl", {
      status: "error",
      records_in: 0,
      records_upserted: 0,
      records_failed: 1,
      error:
        "Event ingest schema is not ready: missing ingested_events.hero_image.",
    });
    expect(body).toMatchObject({
      ok: false,
      status: "error",
      schema: {
        ready: false,
        missing: ["ingested_events.hero_image"],
      },
    });
  });

  it("fails before fetching when a non-dry run has no database", async () => {
    mocks.getSql.mockReturnValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      status: "error",
      dry: false,
      error: "no database",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.checkEventSchemaReadiness).not.toHaveBeenCalled();
    expect(mocks.fcplMapFeed).not.toHaveBeenCalled();
    expect(mocks.upsertEvent).not.toHaveBeenCalled();
  });

  it("keeps dry runs independent from database migration readiness", async () => {
    mocks.getSql.mockReturnValue(null);
    mocks.checkEventSchemaReadiness.mockRejectedValue(
      new Error("schema unavailable"),
    );

    const response = await GET(request("?dry=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: "ok", dry: true });
    expect(mocks.checkEventSchemaReadiness).not.toHaveBeenCalled();
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.upsertEvent).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.fcplMapFeed).toHaveBeenCalledOnce();
  });

  it("records a redacted schema-query failure without fetching", async () => {
    mocks.checkEventSchemaReadiness.mockRejectedValue(
      new Error(
        "catalog unavailable DATABASE_URL=postgres://radius:do-not-log@example.test/radius",
      ),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    const runError = mocks.finishIngestRun.mock.calls.at(-1)?.[1]?.error;
    expect(runError).toContain("Event ingest schema check failed");
    expect(runError).toContain("[redacted]");
    expect(runError).not.toContain("do-not-log");
    expect(body.error).toBe(runError);
  });

  it("records budget-deferred geocoding as a partial ingest", async () => {
    mocks.geocodeLimitForRemaining.mockReturnValue(0);

    const response = await GET(request());
    const body = await response.json();

    expect(mocks.geocodePending).not.toHaveBeenCalled();
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-fcpl",
      expect.objectContaining({
        status: "partial",
        error: expect.stringContaining("geocode degraded: route-budget"),
      }),
    );
    expect(body.geocode).toMatchObject({
      status: "degraded",
      degradedReason: "route-budget",
    });
  });

  it("fails the run when all 781 event writes fail and keeps only a redacted first error", async () => {
    mocks.fcplMapFeed.mockReturnValue(
      Array.from({ length: 781 }, (_, index) => ({
        event: { uid: `library-${index + 1}` },
        municipality: "Frederick",
        category: "Library",
      })),
    );
    mocks.upsertEvent
      .mockRejectedValueOnce(
        new Error(
          'column "location_key" does not exist; DATABASE_URL=postgres://radius:do-not-log@example.test/radius',
        ),
      )
      .mockRejectedValue(new Error("later write failure"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      status: "error",
      mapped: 781,
      failed: 781,
    });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-fcpl",
      expect.objectContaining({
        status: "error",
        records_in: 781,
        records_failed: 781,
        error: expect.stringContaining(
          'all 781 event writes failed: column "location_key" does not exist',
        ),
      }),
    );
    const runError = mocks.finishIngestRun.mock.calls.at(-1)?.[1]?.error;
    expect(runError).toContain("[redacted]");
    expect(runError).not.toContain("do-not-log");
    expect(runError).not.toContain("postgres://");
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("marks a mixed write batch partial instead of ok", async () => {
    mocks.fcplMapFeed.mockReturnValue([
      {
        event: { uid: "library-1" },
        municipality: "Frederick",
        category: "Library",
      },
      {
        event: { uid: "library-2" },
        municipality: "Frederick",
        category: "Library",
      },
    ]);
    mocks.upsertEvent
      .mockRejectedValueOnce(new Error("normalized event insert failed"))
      .mockResolvedValueOnce(undefined);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: false, status: "partial", failed: 1 });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-fcpl",
      expect.objectContaining({
        status: "partial",
        records_failed: 1,
        error: "1 of 2 event write failed: normalized event insert failed",
      }),
    );
  });
});
