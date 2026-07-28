import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ del: vi.fn() }));

vi.mock("@vercel/blob", () => ({ del: mocks.del }));

import {
  deleteCommunityReportPhoto,
  isManagedCommunityReportPhoto,
} from "@/lib/community-report-photo";

const MANAGED =
  "https://store.public.blob.vercel-storage.com/community-reports/report.jpg";

describe("community report photo cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mocks.del.mockResolvedValue(undefined);
  });

  it("only recognizes the community-report prefix on Vercel public Blob hosts", () => {
    expect(isManagedCommunityReportPhoto(MANAGED)).toBe(true);
    expect(
      isManagedCommunityReportPhoto(
        "https://store.public.blob.vercel-storage.com/google-places/report.jpg",
      ),
    ).toBe(false);
    expect(
      isManagedCommunityReportPhoto(
        "https://store.public.blob.vercel-storage.com.evil.example/community-reports/report.jpg",
      ),
    ).toBe(false);
    expect(isManagedCommunityReportPhoto("not a url")).toBe(false);
  });

  it("deletes managed photos and ignores unrelated URLs", async () => {
    await expect(deleteCommunityReportPhoto(MANAGED)).resolves.toBe(true);
    expect(mocks.del).toHaveBeenCalledWith(
      MANAGED,
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
      }),
    );

    mocks.del.mockClear();
    await expect(
      deleteCommunityReportPhoto("https://example.com/community-reports/report.jpg"),
    ).resolves.toBe(true);
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
