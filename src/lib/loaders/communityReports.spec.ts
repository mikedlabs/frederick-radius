import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  deletePhoto: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/community-report-photo", () => ({
  deleteCommunityReportPhoto: mocks.deletePhoto,
}));

import { pruneExpiredReports } from "./communityReports";

describe("pruneExpiredReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deletePhoto.mockResolvedValue(true);
  });

  it("deletes only rows still eligible before removing their Blob", async () => {
    let finishDelete:
      | ((rows: Array<{ id: string; photo_url: string | null }>) => void)
      | undefined;
    const returning = vi.fn(
      () =>
        new Promise<Array<{ id: string; photo_url: string | null }>>(
          (resolve) => {
            finishDelete = resolve;
          },
        ),
    );
    const database = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                { id: "still-expired", photo_url: "https://blob.example/old.jpg" },
                { id: "restored-by-admin", photo_url: "https://blob.example/live.jpg" },
              ]),
            })),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning })),
      })),
    };
    mocks.getDb.mockReturnValue(database);

    const pruning = pruneExpiredReports();
    await vi.waitFor(() => expect(returning).toHaveBeenCalledTimes(1));
    expect(mocks.deletePhoto).not.toHaveBeenCalled();

    // The database's atomic DELETE recheck omits the report an admin restored.
    finishDelete?.([
      { id: "still-expired", photo_url: "https://blob.example/old.jpg" },
    ]);

    await expect(pruning).resolves.toBe(1);
    expect(mocks.deletePhoto).toHaveBeenCalledTimes(1);
    expect(mocks.deletePhoto).toHaveBeenCalledWith(
      "https://blob.example/old.jpg",
    );
  });
});
