import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Guards on the claim REQUEST endpoint. It is only a request (no location, no
 * token), but it still mirrors the collect route's envelope: same-origin,
 * rate-limited, a real roster truck, and fail-closed when no DB is configured.
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

import { POST } from "@/app/api/food-trucks/claim/route";

const SLUG = "blues-bbq";

function request() {
  return new NextRequest("https://frederickradius.app/api/food-trucks/claim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://frederickradius.app",
      "x-forwarded-for": "203.0.113.7",
    },
    body: "{}",
  });
}

function insertMock() {
  const values = vi.fn().mockResolvedValue(undefined);
  return { insert: vi.fn(() => ({ values })), values };
}

describe("/api/food-trucks/claim guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { truckSlug: SLUG, operatorName: "Sam", contact: "sam@example.com" },
    });
  });

  it("rejects a foreign origin before any DB work", async () => {
    mocks.isSameOriginMutationRequest.mockReturnValue(false);
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rate-limits before retaining a body", async () => {
    mocks.isRateLimited.mockResolvedValue(true);
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(mocks.readJsonBodyWithLimit).not.toHaveBeenCalled();
  });

  it("rejects an unknown truck slug", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { truckSlug: "nope", operatorName: "Sam", contact: "sam@example.com" },
    });
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unknown-truck" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects a missing name or contact", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { truckSlug: SLUG, operatorName: "  ", contact: "" },
    });
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing-fields" });
  });

  it("fails closed with 503 when no database is configured", async () => {
    mocks.getDb.mockReturnValue(null);
    const res = await POST(request());
    expect(res.status).toBe(503);
  });

  it("inserts a pending claim on a valid request", async () => {
    const insert = insertMock();
    mocks.getDb.mockReturnValue({ insert: insert.insert });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({ truck_slug: SLUG, operator_name: "Sam", contact: "sam@example.com" }),
    );
  });
});
