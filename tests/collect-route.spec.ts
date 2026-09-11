import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readJsonBodyWithLimit: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readJsonBodyWithLimit: mocks.readJsonBodyWithLimit,
}));

import { DELETE, PATCH, POST } from "@/app/api/collect/route";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const OLD_PHOTO =
  "https://store.public.blob.vercel-storage.com/field-photos/old.jpg";
const NEW_PHOTO =
  "https://store.public.blob.vercel-storage.com/field-photos/new.jpg";
const JPEG = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9,
]).toString("base64")}`;

function request(method: "POST" | "PATCH" | "DELETE") {
  return new NextRequest("https://frederickradius.app/api/collect", {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://frederickradius.app",
      "x-forwarded-for": "203.0.113.8",
    },
    body: "{}",
  });
}

function selectRows(rows: Array<{ photo_url: string | null }>) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return vi.fn(() => ({ from }));
}

function insertReturning(result: Promise<Array<{ id: string }>>) {
  const returning = vi.fn(() => result);
  const values = vi.fn(() => ({ returning }));
  return vi.fn(() => ({ values }));
}

function updateReturning(...results: Array<Promise<Array<{ id: string }>>>) {
  const returning = vi.fn();
  for (const result of results) returning.mockImplementationOnce(() => result);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { update: vi.fn(() => ({ set })), set, where, returning };
}

function deleteReturning(result: Promise<Array<{ id: string }>>) {
  const returning = vi.fn(() => result);
  const where = vi.fn(() => ({ returning }));
  return { delete: vi.fn(() => ({ where })), where, returning };
}

describe("/api/collect mutation security and photo lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COLLECT_PASSCODE = "correct horse battery staple";
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { passcode: process.env.COLLECT_PASSCODE },
    });
    mocks.put.mockResolvedValue({ url: NEW_PHOTO });
    mocks.del.mockResolvedValue(undefined);
  });

  it("rejects foreign origins before rate-limit, body, Blob, or DB work", async () => {
    mocks.isSameOriginMutationRequest.mockReturnValue(false);

    const response = await POST(request("POST"));

    expect(response.status).toBe(403);
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.readJsonBodyWithLimit).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rate-limits before retaining a multi-megabyte JSON body", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const response = await PATCH(request("PATCH"));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(mocks.readJsonBodyWithLimit).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("fails closed when the server passcode is not configured", async () => {
    delete process.env.COLLECT_PASSCODE;
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { passcode: "anything", kind: "bench", lng: -77.4105, lat: 39.4143 },
    });

    const response = await POST(request("POST"));

    expect(response.status).toBe(401);
    expect(mocks.readJsonBodyWithLimit).toHaveBeenCalledWith(expect.anything(), 6 * 1024 * 1024);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("removes a newly uploaded photo when the database insert fails", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        passcode: process.env.COLLECT_PASSCODE,
        kind: "bench",
        lng: -77.4105,
        lat: 39.4143,
        photo: JPEG,
      },
    });
    mocks.getDb.mockReturnValue({
      insert: insertReturning(Promise.reject(new Error("insert failed"))),
    });

    const response = await POST(request("POST"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "insert-failed" });
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.del).toHaveBeenCalledWith(NEW_PHOTO);
  });

  it("deletes the superseded managed photo after a successful replacement", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { passcode: process.env.COLLECT_PASSCODE, id: ID, photo: JPEG },
    });
    const update = updateReturning(Promise.resolve([{ id: ID }]));
    mocks.getDb.mockReturnValue({
      select: selectRows([{ photo_url: OLD_PHOTO }]),
      update: update.update,
    });

    const response = await PATCH(request("PATCH"));

    expect(response.status).toBe(200);
    expect(mocks.del).toHaveBeenCalledWith(OLD_PHOTO);
    expect(mocks.del).not.toHaveBeenCalledWith(NEW_PHOTO);
  });

  it("rolls back the replacement upload when the database update fails", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { passcode: process.env.COLLECT_PASSCODE, id: ID, photo: JPEG },
    });
    const update = updateReturning(Promise.reject(new Error("update failed")));
    mocks.getDb.mockReturnValue({
      select: selectRows([{ photo_url: OLD_PHOTO }]),
      update: update.update,
    });

    const response = await PATCH(request("PATCH"));

    expect(response.status).toBe(500);
    expect(mocks.del).toHaveBeenCalledWith(NEW_PHOTO);
    expect(mocks.del).not.toHaveBeenCalledWith(OLD_PHOTO);
  });

  it("keeps the database row when its managed photo cannot be removed", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { passcode: process.env.COLLECT_PASSCODE, id: ID },
    });
    mocks.del.mockRejectedValue(new Error("Blob unavailable"));
    const update = updateReturning(Promise.resolve([{ id: ID }]));
    const remove = deleteReturning(Promise.resolve([{ id: ID }]));
    mocks.getDb.mockReturnValue({
      select: selectRows([{ photo_url: OLD_PHOTO }]),
      update: update.update,
      delete: remove.delete,
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await DELETE(request("DELETE"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "photo-cleanup-failed" });
    expect(update.update).not.toHaveBeenCalled();
    expect(remove.delete).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it("clears the managed URL before deleting the row so a DB retry cannot orphan it", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { passcode: process.env.COLLECT_PASSCODE, id: ID },
    });
    const update = updateReturning(Promise.resolve([{ id: ID }]));
    const remove = deleteReturning(Promise.resolve([{ id: ID }]));
    mocks.getDb.mockReturnValue({
      select: selectRows([{ photo_url: OLD_PHOTO }]),
      update: update.update,
      delete: remove.delete,
    });

    const response = await DELETE(request("DELETE"));

    expect(response.status).toBe(200);
    expect(mocks.del).toHaveBeenCalledWith(OLD_PHOTO);
    expect(update.set).toHaveBeenCalledWith({ photo_url: null });
    expect(remove.delete).toHaveBeenCalledOnce();
  });
});
