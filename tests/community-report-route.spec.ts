import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  put: vi.fn(),
  deleteCommunityReportPhoto: vi.fn(),
  getCommunityReports: vi.fn(),
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readJsonBodyWithLimit: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/community-report-photo", () => ({
  deleteCommunityReportPhoto: mocks.deleteCommunityReportPhoto,
}));
vi.mock("@/lib/loaders/communityReports", () => ({
  getCommunityReports: mocks.getCommunityReports,
}));
vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readJsonBodyWithLimit: mocks.readJsonBodyWithLimit,
}));

import { POST } from "@/app/api/reports/route";

const PHOTO_URL =
  "https://example.public.blob.vercel-storage.com/community-reports/report.jpg";

function request() {
  return new NextRequest("https://frederickradius.app/api/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://frederickradius.app",
    },
    body: "{}",
  });
}

function dbReturning(result: Promise<Array<{ id: string }>>) {
  const returning = vi.fn(() => result);
  const values = vi.fn(() => ({ returning }));
  return { insert: vi.fn(() => ({ values })) };
}

describe("POST /api/reports photo lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        category: "hazard",
        subtype: "pothole",
        note: "Pothole by the curb",
        photo: "data:image/jpeg;base64,aGVsbG8=",
        lng: -77.4105,
        lat: 39.4143,
      },
    });
    mocks.put.mockResolvedValue({ url: PHOTO_URL });
    mocks.deleteCommunityReportPhoto.mockResolvedValue(true);
  });

  it("deletes an uploaded photo when the database insert fails", async () => {
    mocks.getDb.mockReturnValue(
      dbReturning(Promise.reject(new Error("database unavailable"))),
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "insert-failed" });
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.deleteCommunityReportPhoto).toHaveBeenCalledWith(PHOTO_URL);
  });

  it("keeps the uploaded photo when its database row is created", async () => {
    mocks.getDb.mockReturnValue(dbReturning(Promise.resolve([{ id: "report-1" }])));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.deleteCommunityReportPhoto).not.toHaveBeenCalled();
  });
});
