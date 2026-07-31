import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  refreshVisitFrederickSnapshot: vi.fn(),
  startIngestRun: vi.fn(),
  finishIngestRun: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("../../ingest/_auth", () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock("@/lib/integrations/visitfrederick-refresh", () => ({
  refreshVisitFrederickSnapshot:
    mocks.refreshVisitFrederickSnapshot,
}));
vi.mock("@/lib/ingest/run-log", () => ({
  startIngestRun: mocks.startIngestRun,
  finishIngestRun: mocks.finishIngestRun,
}));

import { GET } from "./route";

function request() {
  return new Request(
    "https://frederickradius.app/api/cron/visit-frederick",
  );
}

function refreshResult(
  overrides: Record<string, unknown> = {},
) {
  return {
    ok: true,
    skipped: false,
    updated: true,
    via: "native",
    events: 2,
    status: "ok-native",
    reason: null,
    budget: { limit: 12, reserved: false, count: null },
    storage: { stored: true, url: "https://blob.example/snapshot.json" },
    ...overrides,
  };
}

describe("GET /api/cron/visit-frederick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.startIngestRun.mockResolvedValue("run-vf");
    mocks.finishIngestRun.mockResolvedValue(undefined);
    mocks.refreshVisitFrederickSnapshot.mockResolvedValue(refreshResult());
  });

  it("short-circuits before work when cron authentication fails", async () => {
    const unauthorized = Response.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mocks.verifyCronAuth.mockReturnValue(unauthorized);

    const response = await GET(request());

    expect(response).toBe(unauthorized);
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.refreshVisitFrederickSnapshot).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("records and revalidates every consuming surface after a durable update", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      skipped: false,
      updated: true,
      via: "native",
      events: 2,
      source_status: "ok-native",
      budget: { limit: 12, reserved: false, count: null },
    });
    expect(mocks.startIngestRun).toHaveBeenCalledWith(
      "visit-frederick-snapshot",
    );
    expect(mocks.revalidateTag.mock.calls).toEqual([
      ["visit-frederick", "max"],
      ["events", "max"],
    ]);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/today"],
      ["/events"],
      ["/map"],
    ]);
    expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-vf", {
      status: "ok",
      records_in: 2,
      records_upserted: 2,
      records_failed: 0,
      error: null,
    });
  });

  it("does not invalidate caches for an interval-owned skip", async () => {
    mocks.refreshVisitFrederickSnapshot.mockResolvedValue(
      refreshResult({
        skipped: true,
        updated: false,
        storage: null,
        reason: "A recent refresh attempt already owns this interval.",
      }),
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.finishIngestRun).not.toHaveBeenCalled();
  });

  it("does not create a source heartbeat for the approval-gated skip", async () => {
    mocks.refreshVisitFrederickSnapshot.mockResolvedValue(
      refreshResult({
        skipped: true,
        updated: false,
        via: null,
        events: 0,
        status: "failed",
        storage: null,
        reason:
          "Visit Frederick factual reuse is awaiting documented written permission.",
      }),
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      skipped: true,
      updated: false,
    });
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.finishIngestRun).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ["The daily Firecrawl recovery limit has been reached.", 503],
    ["The Firecrawl budget could not be reserved.", 503],
    ["Firecrawl returned an invalid publisher snapshot.", 502],
  ])(
    "returns %s class failures with the intended HTTP status",
    async (reason, expectedStatus) => {
      mocks.refreshVisitFrederickSnapshot.mockResolvedValue(
        refreshResult({
          ok: false,
          updated: true,
          via: null,
          status: "failed",
          reason,
          storage: { stored: true },
        }),
      );

      const response = await GET(request());

      expect(response.status).toBe(expectedStatus);
      expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-vf", {
        status: "partial",
        records_in: 2,
        records_upserted: 2,
        records_failed: 1,
        error: "Visit Frederick snapshot refresh did not complete.",
      });
    },
  );

  it("returns 503 when durable snapshot storage is unavailable", async () => {
    mocks.refreshVisitFrederickSnapshot.mockResolvedValue(
      refreshResult({
        ok: false,
        updated: false,
        via: null,
        status: "failed",
        reason: "Snapshot storage was unavailable",
        storage: {
          stored: false,
          reason: "Snapshot storage was unavailable",
        },
      }),
    );

    const response = await GET(request());

    expect(response.status).toBe(503);
  });

  it("records an unexpected exception without leaking it to the response", async () => {
    mocks.refreshVisitFrederickSnapshot.mockRejectedValue(
      new Error("secret provider failure"),
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Visit Frederick snapshot refresh failed.",
    });
    expect(mocks.finishIngestRun).toHaveBeenCalledWith("run-vf", {
      status: "error",
      records_in: 0,
      records_upserted: 0,
      records_failed: 1,
      error: "Visit Frederick snapshot refresh failed unexpectedly.",
    });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
