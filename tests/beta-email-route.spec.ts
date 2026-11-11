import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isRateLimited: vi.fn(),
  isSameOriginMutationRequest: vi.fn(),
  inviteEmail: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/origin-check", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/origin-check")>();
  return {
    ...actual,
    isRateLimited: mocks.isRateLimited,
    isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  };
});
vi.mock("@/lib/beta-invite", () => ({ inviteEmail: mocks.inviteEmail }));

import { POST } from "@/app/api/beta/email/route";

function request(email = "tester@example.com", next: unknown = "/today") {
  return new NextRequest("https://frederickradius.app/api/beta/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, next }),
  });
}

function dbReturning() {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoNothing }));
  return { insert: vi.fn(() => ({ values })) };
}

describe("POST /api/beta/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("retains a new signup without claiming an undelivered invite was sent", async () => {
    mocks.getDb.mockReturnValue(dbReturning());
    mocks.inviteEmail.mockResolvedValue({ code: "frederick-abcd", sent: false });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      sent: false,
      stored: true,
    });
    expect(mocks.inviteEmail).toHaveBeenCalledWith("tester@example.com", "/today");
  });

  it("retries delivery for a duplicate signup and reports success only after send", async () => {
    mocks.getDb.mockReturnValue(dbReturning());
    mocks.inviteEmail.mockResolvedValue({ code: "frederick-abcd", sent: true });

    const response = await POST(request(" Tester@Example.com "));

    expect(await response.json()).toEqual({
      ok: true,
      sent: true,
      stored: true,
    });
    expect(mocks.inviteEmail).toHaveBeenCalledWith("tester@example.com", "/today");
  });

  it("preserves a shared destination in the emailed access link", async () => {
    mocks.getDb.mockReturnValue(dbReturning());
    mocks.inviteEmail.mockResolvedValue({ code: "frederick-abcd", sent: true });

    await POST(request("tester@example.com", "/events/alive-at-five?from=share"));

    expect(mocks.inviteEmail).toHaveBeenCalledWith(
      "tester@example.com",
      "/events/alive-at-five?from=share",
    );
  });

  it("rejects an external return destination", async () => {
    mocks.getDb.mockReturnValue(dbReturning());
    mocks.inviteEmail.mockResolvedValue({ code: "frederick-abcd", sent: true });

    await POST(request("tester@example.com", "https://evil.example/phish"));

    expect(mocks.inviteEmail).toHaveBeenCalledWith("tester@example.com", "/today");
  });
});
