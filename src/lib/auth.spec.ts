import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { getServerUser, getServerUserId } from "./auth";

describe("verified server auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
  });

  it("builds the app user from verified JWT claims", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-123",
          email: "local@example.com",
          last_sign_in_at: null,
        },
      },
      error: null,
    });

    await expect(getServerUser()).resolves.toEqual({
      id: "user-123",
      email: "local@example.com",
      last_sign_in_at: null,
    });
    await expect(getServerUserId()).resolves.toBe("user-123");
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("fails closed when claims are absent or verification throws", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: null,
      error: new Error("invalid token"),
    });
    await expect(getServerUser()).resolves.toBeNull();

    mocks.getUser.mockRejectedValueOnce(new Error("JWKS unavailable"));
    await expect(getServerUserId()).resolves.toBeNull();
  });
});
