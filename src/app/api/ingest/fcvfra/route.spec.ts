import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
  upsertEvent: vi.fn(),
  geocodePending: vi.fn(),
  geocodeLimitForRemaining: vi.fn(),
  fcvfraMapListing: vi.fn(),
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
vi.mock("@/lib/ingest/fcvfra", () => ({
  FCVFRA_SOURCE_DOMAIN: "fcvfra.com",
  fcvfraMapListing: mocks.fcvfraMapListing,
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

function request(query = "") {
  return new NextRequest(
    `https://frederickradius.app/api/ingest/fcvfra${query}`,
  );
}

describe("GET /api/ingest/fcvfra geocode budget", () => {
  const sql = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.getSql.mockReturnValue(sql);
    mocks.startIngestRun.mockResolvedValue("run-fcvfra");
    mocks.finishIngestRun.mockResolvedValue(undefined);
    mocks.checkEventSchemaReadiness.mockResolvedValue({
      ready: true,
      missing: [],
    });
    mocks.fcvfraMapListing.mockReturnValue([
      {
        event: { uid: "fire-1" },
        municipality: "Thurmont",
        category: "Community",
      },
    ]);
    mocks.upsertEvent.mockResolvedValue(undefined);
    mocks.geocodeLimitForRemaining.mockReturnValue(4);
    mocks.geocodePending.mockResolvedValue({
      fromCache: 0,
      fromOfficial: 0,
      fromApi: 0,
      failed: 1,
      seeded: 0,
      revalidated: 0,
      repaired: 0,
      cleared: 0,
      status: "degraded",
      degradedReason: "network",
      budgetStopped: 0,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bounds the geocode tail and exposes degraded provider telemetry", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(mocks.geocodeLimitForRemaining).toHaveBeenCalledWith(
      expect.any(Number),
      400,
    );
    const remainingMs = mocks.geocodeLimitForRemaining.mock.calls[0][0];
    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThanOrEqual(105_000);
    expect(mocks.geocodePending).toHaveBeenCalledWith(sql, 4, {
      deadlineAt: expect.any(Number),
    });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-fcvfra",
      expect.objectContaining({
        status: "partial",
        error: "geocode degraded: network",
      }),
    );
    expect(body.geocode).toMatchObject({
      status: "degraded",
      degradedReason: "network",
    });
  });

  it("fails before downloading the listing when the event schema is incomplete", async () => {
    mocks.checkEventSchemaReadiness.mockResolvedValue({
      ready: false,
      missing: ["ingested_events.hero_image_alt"],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.fcvfraMapListing).not.toHaveBeenCalled();
    expect(mocks.upsertEvent).not.toHaveBeenCalled();
    expect(mocks.geocodePending).not.toHaveBeenCalled();
    expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-fcvfra", {
      status: "error",
      records_in: 0,
      records_upserted: 0,
      records_failed: 1,
      error:
        "Event ingest schema is not ready: missing ingested_events.hero_image_alt.",
    });
    expect(body).toMatchObject({
      ok: false,
      status: "error",
      schema: {
        ready: false,
        missing: ["ingested_events.hero_image_alt"],
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
    expect(mocks.fcvfraMapListing).not.toHaveBeenCalled();
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
    expect(mocks.fcvfraMapListing).toHaveBeenCalledOnce();
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

  it("fails the run when all 9 event writes fail", async () => {
    mocks.fcvfraMapListing.mockReturnValue(
      Array.from({ length: 9 }, (_, index) => ({
        event: { uid: `fire-${index + 1}` },
        municipality: "Thurmont",
        category: "Community",
      })),
    );
    mocks.upsertEvent.mockRejectedValue(new Error("event transaction failed"));
    mocks.geocodePending.mockResolvedValue({
      fromCache: 0,
      fromOfficial: 0,
      fromApi: 0,
      failed: 0,
      seeded: 0,
      revalidated: 0,
      repaired: 0,
      cleared: 0,
      status: "ok",
      budgetStopped: 0,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      status: "error",
      mapped: 9,
      failed: 9,
    });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-fcvfra",
      expect.objectContaining({
        status: "error",
        records_in: 9,
        records_failed: 9,
        error: "all 9 event writes failed: event transaction failed",
      }),
    );
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
