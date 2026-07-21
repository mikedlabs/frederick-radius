import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readJsonBodyWithLimit: vi.fn(),
  parseLetterScanDataUrl: vi.fn(),
  deleteLetterScan: vi.fn(),
  getDb: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readJsonBodyWithLimit: mocks.readJsonBodyWithLimit,
}));
vi.mock("@/lib/dear-frederick/letter-scan", () => ({
  parseLetterScanDataUrl: mocks.parseLetterScanDataUrl,
  deleteLetterScan: mocks.deleteLetterScan,
}));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));

import { POST } from "./route";

function request(body: string = "{}") {
  return new NextRequest("https://frederickradius.app/api/dear-frederick/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://frederickradius.app",
      "x-forwarded-for": "198.51.100.42",
    },
    body,
  });
}

const VALID_SCAN = {
  status: "valid" as const,
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  contentType: "image/jpeg" as const,
  extension: "jpg" as const,
};

/** A db whose insert().values() resolves; `valuesMock` is swappable per-test. */
function fakeDb() {
  const valuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return { db: { insert: insertMock }, insertMock, valuesMock };
}

describe("/api/dear-frederick/submit guards", () => {
  const MANAGED_URL =
    "https://store.public.blob.vercel-storage.com/dear-frederick-scans/letter.jpg";

  beforeEach(() => {
    vi.clearAllMocks();
    // Happy defaults; each test overrides the guard it exercises.
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readJsonBodyWithLimit.mockResolvedValue({ ok: true, value: { image: "data:..." } });
    mocks.parseLetterScanDataUrl.mockReturnValue(VALID_SCAN);
    mocks.deleteLetterScan.mockResolvedValue(true);
    mocks.put.mockResolvedValue({ url: MANAGED_URL });
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("rejects a cross-origin request before reading the body", async () => {
    mocks.isSameOriginMutationRequest.mockReturnValue(false);

    const res = await POST(request());

    expect(res.status).toBe(403);
    expect(mocks.readJsonBodyWithLimit).not.toHaveBeenCalled();
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
  });

  it("rate-limits before reading the body or touching storage", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const res = await POST(request());

    expect(res.status).toBe(429);
    expect(mocks.readJsonBodyWithLimit).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("returns 413 when the body exceeds the size cap", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({ ok: false, error: "body-too-large" });

    const res = await POST(request());

    expect(res.status).toBe(413);
    expect(mocks.parseLetterScanDataUrl).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON and for a non-object body", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValueOnce({ ok: false, error: "invalid-json" });
    expect((await POST(request())).status).toBe(400);

    mocks.readJsonBodyWithLimit.mockResolvedValueOnce({ ok: true, value: [1, 2, 3] });
    expect((await POST(request())).status).toBe(400);
  });

  it("requires a scan and rejects an invalid or oversize one", async () => {
    mocks.parseLetterScanDataUrl.mockReturnValueOnce({ status: "absent" });
    const missing = await POST(request());
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: "scan-required" });

    mocks.parseLetterScanDataUrl.mockReturnValueOnce({ status: "invalid", error: "scan-invalid" });
    expect((await POST(request())).status).toBe(400);

    mocks.parseLetterScanDataUrl.mockReturnValueOnce({ status: "invalid", error: "scan-too-large" });
    expect((await POST(request())).status).toBe(413);
  });

  it("fails closed with 503 and never touches Blob when the database is unconfigured", async () => {
    mocks.getDb.mockReturnValue(null);

    const res = await POST(request());

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "database-unavailable" });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("fails closed with 503 and never inserts when Blob storage is unconfigured", async () => {
    const { db, insertMock } = fakeDb();
    mocks.getDb.mockReturnValue(db);
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const res = await POST(request());

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "scan-storage-unavailable" });
    expect(mocks.put).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("stores the scan and inserts a pending row on the happy path", async () => {
    const { db, insertMock, valuesMock } = fakeDb();
    mocks.getDb.mockReturnValue(db);
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { image: "data:...", signature: "  A neighbor  ", contact: "me@example.com", note: "  hi  " },
    });

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
    // Clipped/trimmed text fields and the stored Blob URL are persisted.
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        image_url: MANAGED_URL,
        signature: "A neighbor",
        contact: "me@example.com",
        note: "hi",
      }),
    );
  });

  it("compensates by deleting the uploaded scan when the insert fails", async () => {
    const { db, valuesMock } = fakeDb();
    valuesMock.mockRejectedValue(new Error("db down"));
    mocks.getDb.mockReturnValue(db);

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "insert-failed" });
    expect(mocks.deleteLetterScan).toHaveBeenCalledWith(MANAGED_URL);
  });
});
