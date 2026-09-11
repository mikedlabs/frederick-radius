import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Guards on the PUBLIC beacon write. The point of these tests is the security
 * envelope: a forged write must be rejected before it can touch the database,
 * and a well-formed write must carry a token that resolves to an APPROVED claim
 * for the exact truck. The expiry cap is exercised too, since it is the
 * write-side half of the honest-expiry guarantee.
 */

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readJsonBodyWithLimit: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readJsonBodyWithLimit: mocks.readJsonBodyWithLimit,
}));

import { DELETE, GET, POST } from "@/app/api/food-trucks/beacon/route";

const TOKEN = "a".repeat(32);
const SLUG = "blues-bbq"; // a real roster slug
const IN_COUNTY = { lng: -77.41, lat: 39.41 };
const HOUR = 60 * 60 * 1000;

function writeRequest(method: "POST" | "DELETE") {
  return new NextRequest("https://frederickradius.app/api/food-trucks/beacon", {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://frederickradius.app",
      "x-forwarded-for": "203.0.113.9",
    },
    body: "{}",
  });
}

function getRequest(token: string | null) {
  const url = token
    ? `https://frederickradius.app/api/food-trucks/beacon?token=${encodeURIComponent(token)}`
    : "https://frederickradius.app/api/food-trucks/beacon";
  return new NextRequest(url, { method: "GET", headers: { "x-forwarded-for": "203.0.113.9" } });
}

/** Queue one or more result batches for successive `db.select(...)` chains. */
function selectMock(...batches: unknown[][]) {
  const select = vi.fn();
  for (const rows of batches) {
    const limit = vi.fn().mockResolvedValue(rows);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ limit, orderBy }));
    const from = vi.fn(() => ({ where }));
    select.mockImplementationOnce(() => ({ from }));
  }
  return select;
}

function insertMock(result: Promise<Array<{ id: string }>>) {
  const returning = vi.fn(() => result);
  const values = vi.fn((v: Record<string, unknown>) => {
    void v;
    return { returning };
  });
  return { insert: vi.fn(() => ({ values })), values, returning };
}

function updateMock(result: Promise<Array<{ id: string }>>) {
  const returning = vi.fn(() => result);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { update: vi.fn(() => ({ set })), set, where, returning };
}

describe("/api/food-trucks/beacon write guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { token: TOKEN, truckSlug: SLUG, ...IN_COUNTY },
    });
  });

  it("rejects a foreign origin before rate-limit, body, or DB work", async () => {
    mocks.isSameOriginMutationRequest.mockReturnValue(false);
    const res = await POST(writeRequest("POST"));
    expect(res.status).toBe(403);
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.readJsonBodyWithLimit).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rate-limits before retaining a body", async () => {
    mocks.isRateLimited.mockResolvedValue(true);
    const res = await POST(writeRequest("POST"));
    expect(res.status).toBe(429);
    expect(mocks.readJsonBodyWithLimit).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects a malformed token before any DB work", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { token: "short", truckSlug: SLUG, ...IN_COUNTY },
    });
    const res = await POST(writeRequest("POST"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "bad-token" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects an unknown truck slug", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { token: TOKEN, truckSlug: "not-a-real-truck", ...IN_COUNTY },
    });
    const res = await POST(writeRequest("POST"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unknown-truck" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("county-locks the coordinates", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { token: TOKEN, truckSlug: SLUG, lng: -80, lat: 39 },
    });
    const res = await POST(writeRequest("POST"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "out-of-bounds" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when no database is configured", async () => {
    mocks.getDb.mockReturnValue(null);
    const res = await POST(writeRequest("POST"));
    expect(res.status).toBe(503);
  });

  it("rejects a well-formed token that matches no approved claim", async () => {
    const insert = insertMock(Promise.resolve([{ id: "beacon-1" }]));
    mocks.getDb.mockReturnValue({ select: selectMock([]), insert: insert.insert });
    const res = await POST(writeRequest("POST"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "bad-token" });
    expect(insert.insert).not.toHaveBeenCalled();
  });

  it("writes a beacon when the token matches an approved claim, capping expiry at 8 hours", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        token: TOKEN,
        truckSlug: SLUG,
        ...IN_COUNTY,
        spot: "Baker Park",
        note: "Birria",
        until: new Date(Date.now() + 20 * HOUR).toISOString(), // asks for 20h
      },
    });
    const insert = insertMock(Promise.resolve([{ id: "beacon-1" }]));
    mocks.getDb.mockReturnValue({ select: selectMock([{ id: "claim-1" }]), insert: insert.insert });

    const before = Date.now();
    const res = await POST(writeRequest("POST"));
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string; expiresAt: string };
    expect(body.ok).toBe(true);
    expect(body.id).toBe("beacon-1");

    const values = insert.values.mock.calls[0][0] as unknown as { started_at: Date; expires_at: Date; spot?: string };
    expect(values.spot).toBe("Baker Park");
    // Capped: never more than 8h out, and strictly in the future.
    expect(values.expires_at.getTime()).toBeLessThanOrEqual(after + 8 * HOUR + 1000);
    expect(values.expires_at.getTime()).toBeGreaterThan(before);
  });

  it("ends live beacons early on DELETE for an approved token", async () => {
    const update = updateMock(Promise.resolve([{ id: "b1" }, { id: "b2" }]));
    mocks.getDb.mockReturnValue({ select: selectMock([{ id: "claim-1" }]), update: update.update });
    const res = await DELETE(writeRequest("DELETE"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ended: 2 });
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ expires_at: expect.any(Date) }));
  });

  it("rejects an early-end for a token with no approved claim", async () => {
    const update = updateMock(Promise.resolve([]));
    mocks.getDb.mockReturnValue({ select: selectMock([]), update: update.update });
    const res = await DELETE(writeRequest("DELETE"));
    expect(res.status).toBe(401);
    expect(update.update).not.toHaveBeenCalled();
  });
});

describe("/api/food-trucks/beacon GET resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("rate-limits reads", async () => {
    mocks.isRateLimited.mockResolvedValue(true);
    const res = await GET(getRequest(TOKEN));
    expect(res.status).toBe(429);
  });

  it("rejects a malformed token", async () => {
    const res = await GET(getRequest("short"));
    expect(res.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when no database is configured", async () => {
    mocks.getDb.mockReturnValue(null);
    const res = await GET(getRequest(TOKEN));
    expect(res.status).toBe(503);
  });

  it("resolves an approved token to its truck with no live beacon", async () => {
    mocks.getDb.mockReturnValue({ select: selectMock([{ truck_slug: SLUG }], []) });
    const res = await GET(getRequest(TOKEN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; truckSlug: string; truckName: string; live: unknown };
    expect(body.ok).toBe(true);
    expect(body.truckSlug).toBe(SLUG);
    expect(body.truckName).toBe("Blues BBQ");
    expect(body.live).toBeNull();
  });

  it("rejects a token that matches no approved claim", async () => {
    mocks.getDb.mockReturnValue({ select: selectMock([]) });
    const res = await GET(getRequest(TOKEN));
    expect(res.status).toBe(401);
  });
});
