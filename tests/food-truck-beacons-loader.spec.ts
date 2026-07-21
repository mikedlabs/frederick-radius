import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The display loader. It must fail soft (no DB, or a query error, degrades to
 * zero live beacons) and must never surface a dead beacon even if the row set
 * hands it one. Each test re-imports the module so the per-request `cache`
 * wrapper starts empty.
 */

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));

const LAT = 39.41;
const LNG = -77.41;
const MIN = 60 * 1000;

type Row = {
  truck_slug: string;
  lat: number;
  lng: number;
  spot: string | null;
  note: string | null;
  started_at: Date;
  expires_at: Date;
};

function dbReturning(rows: Row[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  return { select: vi.fn(() => ({ from })) };
}

async function loader() {
  return import("@/lib/loaders/truckBeacons");
}

describe("truckBeacons loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns empty maps when no database is configured", async () => {
    mocks.getDb.mockReturnValue(null);
    const { getLiveTruckBeacons, getFreshestBeaconByTruck } = await loader();
    expect((await getLiveTruckBeacons()).size).toBe(0);
    expect((await getFreshestBeaconByTruck()).size).toBe(0);
  });

  it("returns empty maps and does not throw when the query fails", async () => {
    const limit = vi.fn().mockRejectedValue(new Error("db down"));
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    mocks.getDb.mockReturnValue({ select: vi.fn(() => ({ from })) });
    const { getFreshestBeaconByTruck } = await loader();
    expect((await getFreshestBeaconByTruck()).size).toBe(0);
  });

  it("keeps the freshest live beacon per truck and drops an expired row", async () => {
    const now = Date.now();
    const rows: Row[] = [
      // freshest live for t1 (DB returns started_at desc)
      { truck_slug: "t1", lat: LAT, lng: LNG, spot: "new spot", note: null, started_at: new Date(now - 10 * MIN), expires_at: new Date(now + 120 * MIN) },
      // older live for t1
      { truck_slug: "t1", lat: LAT, lng: LNG, spot: "old spot", note: null, started_at: new Date(now - 60 * MIN), expires_at: new Date(now + 60 * MIN) },
      // expired for t2 — must be dropped by the read layer
      { truck_slug: "t2", lat: LAT, lng: LNG, spot: "gone", note: null, started_at: new Date(now - 180 * MIN), expires_at: new Date(now - 60 * MIN) },
    ];
    mocks.getDb.mockReturnValue(dbReturning(rows));
    const { getLiveTruckBeacons, getFreshestBeaconByTruck } = await loader();

    const fresh = await getFreshestBeaconByTruck();
    expect(fresh.size).toBe(1);
    expect(fresh.get("t1")?.spot).toBe("new spot");
    expect(fresh.has("t2")).toBe(false);

    const live = await getLiveTruckBeacons();
    expect(live.size).toBe(1);
    expect(live.get("t1")?.spot).toBe("new spot");
    expect(live.get("t1")?.phase).toBe("out");
  });
});
