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

function request() {
  return new NextRequest("https://frederickradius.app/api/ingest/fcpl");
}

describe("GET /api/ingest/fcpl geocode budget", () => {
  const sql = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.getSql.mockReturnValue(sql);
    mocks.startIngestRun.mockResolvedValue("run-fcpl");
    mocks.finishIngestRun.mockResolvedValue(undefined);
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
});
