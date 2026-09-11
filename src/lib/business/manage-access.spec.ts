import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  and: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  getDb: vi.fn(),
  limit: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  eq: mocks.eq,
}));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/db/schema", () => ({
  submissions: {
    id: "id",
    kind: "kind",
    manage_token: "manage_token",
    payload: "payload",
    place_slug: "place_slug",
    status: "status",
    submitter_email: "submitter_email",
  },
}));

import { approvedOwnerClaimForToken } from "./manage-access";

describe("approvedOwnerClaimForToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eq.mockImplementation((column, value) => ({ column, value }));
    mocks.and.mockImplementation((...conditions) => conditions);
    mocks.limit.mockResolvedValue([
      {
        id: "claim-1",
        place_slug: "test-cafe",
        payload: { business_name: "Test Cafe" },
        submitter_email: "owner@example.com",
      },
    ]);
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.getDb.mockReturnValue({ select: mocks.select });
  });

  it("requires the token, approved status, and business-claim kind together", async () => {
    await expect(approvedOwnerClaimForToken("owner-token")).resolves.toMatchObject({
      id: "claim-1",
    });

    expect(mocks.where).toHaveBeenCalledWith([
      { column: "manage_token", value: "owner-token" },
      { column: "status", value: "approved" },
      { column: "kind", value: "business_claim" },
    ]);
  });

  it("refuses an empty or unreasonable capability token before querying", async () => {
    await expect(approvedOwnerClaimForToken("")).resolves.toBeUndefined();
    await expect(
      approvedOwnerClaimForToken("x".repeat(201)),
    ).resolves.toBeUndefined();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
