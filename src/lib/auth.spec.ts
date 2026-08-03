import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { getServerUser, getServerUserId } from "./auth";

describe("verified server auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
    });
  });

  it("builds the app user from verified JWT claims", async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "user-123",
          email: "local@example.com",
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
    expect(mocks.getClaims).toHaveBeenCalledTimes(2);
  });

  it("fails closed when claims are absent or verification throws", async () => {
    mocks.getClaims.mockResolvedValueOnce({
      data: null,
      error: new Error("invalid token"),
    });
    await expect(getServerUser()).resolves.toBeNull();

    mocks.getClaims.mockRejectedValueOnce(new Error("JWKS unavailable"));
    await expect(getServerUserId()).resolves.toBeNull();
  });
});
