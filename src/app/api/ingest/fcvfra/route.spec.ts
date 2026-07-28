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
vi.mock("../_auth", () => ({ verifyCronAuth: mocks.verifyCronAuth }));

import { GET } from "./route";

function request() {
  return new NextRequest("https://frederickradius.app/api/ingest/fcvfra");
}

describe("GET /api/ingest/fcvfra geocode budget", () => {
  const sql = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.getSql.mockReturnValue(sql);
    mocks.startIngestRun.mockResolvedValue("run-fcvfra");
    mocks.finishIngestRun.mockResolvedValue(undefined);
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
});
