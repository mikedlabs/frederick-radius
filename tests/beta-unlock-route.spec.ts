import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readTextBodyWithLimit: vi.fn(),
  betaToken: vi.fn(),
  signCode: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readTextBodyWithLimit: mocks.readTextBodyWithLimit,
}));
vi.mock("@/lib/beta-gate", () => ({
  BETA_COOKIE: "fr_beta",
  BETA_ID_COOKIE: "fr_who",
  BETA_OWNER_MARKER: "owner",
  BETA_TESTER_MARKER: "tester",
  betaToken: mocks.betaToken,
  normalizeCode: (value: string) => value.trim().toLowerCase(),
  signCode: mocks.signCode,
}));

import { POST } from "@/app/api/beta/route";

function request(contentType = "application/x-www-form-urlencoded") {
  return new NextRequest("https://frederickradius.app/api/beta", {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Origin: "https://frederickradius.app",
      "x-forwarded-for": "203.0.113.21",
    },
    body: "password=public-code&next=%2Ftoday",
  });
}

describe("POST /api/beta unlock security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readTextBodyWithLimit.mockResolvedValue({
      ok: true,
      value: "password=public-code&next=%2Ftoday",
    });
  });

  it("rejects a foreign form before rate-limit, body, or database work", async () => {
    mocks.isSameOriginMutationRequest.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.readTextBodyWithLimit).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("enforces the guessing budget before reading the form", async () => {
    mocks.isRateLimited.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
    expect(mocks.readTextBodyWithLimit).not.toHaveBeenCalled();
  });

  it("accepts only the small browser form encoding", async () => {
    const response = await POST(request("application/json"));

    expect(response.status).toBe(415);
    expect(mocks.readTextBodyWithLimit).not.toHaveBeenCalled();
  });

  it("rejects an oversized body without consulting credentials", async () => {
    mocks.readTextBodyWithLimit.mockResolvedValue({
      ok: false,
      error: "body-too-large",
    });

    const response = await POST(request());

    expect(response.status).toBe(413);
    expect(mocks.readTextBodyWithLimit).toHaveBeenCalledWith(expect.anything(), 4096);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
