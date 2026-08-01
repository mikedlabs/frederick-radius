import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncSpatialPlaceMirror: vi.fn(),
}));

vi.mock("@/lib/spatial/place-mirror", () => ({
  syncSpatialPlaceMirror: mocks.syncSpatialPlaceMirror,
}));

import { GET } from "./route";

function request(secret = "test-cron-secret") {
  return new Request(
    "https://frederickradius.app/api/cron/spatial-places",
    { headers: { authorization: `Bearer ${secret}` } },
  );
}

describe("GET /api/cron/spatial-places", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.RADIUS_POSTGIS_SYNC = "1";
    mocks.syncSpatialPlaceMirror.mockResolvedValue({
      checked: 1610,
      upserted: 12,
      retired: 2,
      audit: {
        current: true,
        activeCount: 1610,
        syncedAt: "2026-07-29T12:00:00.000Z",
      },
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.RADIUS_POSTGIS_SYNC;
  });

  it("stays inert until the verified migration is explicitly enabled", async () => {
    delete process.env.RADIUS_POSTGIS_SYNC;

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enabled).toBe(false);
    expect(mocks.syncSpatialPlaceMirror).not.toHaveBeenCalled();
  });

  it("returns the verified mirror state after a successful sync", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      enabled: true,
      healthy: true,
      current: true,
      checked: 1610,
      changed: 12,
      upserted: 12,
      retired: 2,
      place_count: 1610,
    });
    expect(mocks.syncSpatialPlaceMirror).toHaveBeenCalledOnce();
  });

  it("keeps database details out of a failed cron response", async () => {
    mocks.syncSpatialPlaceMirror.mockRejectedValue(
      new Error("postgres://secret@example.test"),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.healthy).toBe(false);
    expect(body.error).not.toContain("postgres://");
  });

  it("rejects an invalid cron credential", async () => {
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.syncSpatialPlaceMirror).not.toHaveBeenCalled();
  });
});
