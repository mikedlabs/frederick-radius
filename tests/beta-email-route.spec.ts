import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isRateLimited: vi.fn(),
  inviteEmail: vi.fn(),
  fanoutToTopic: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/origin-check", () => ({ isRateLimited: mocks.isRateLimited }));
vi.mock("@/lib/beta-invite", () => ({ inviteEmail: mocks.inviteEmail }));
vi.mock("@/lib/push-fanout", () => ({ fanoutToTopic: mocks.fanoutToTopic }));

import { POST } from "@/app/api/beta/email/route";

function request(email = "tester@example.com") {
  return new NextRequest("https://frederickradius.app/api/beta/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

function dbReturning(inserted: Array<{ id: string }>) {
  const returning = vi.fn().mockResolvedValue(inserted);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  return { insert: vi.fn(() => ({ values })) };
}

describe("POST /api/beta/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.fanoutToTopic.mockResolvedValue(undefined);
  });

  it("retains a new signup without claiming an undelivered invite was sent", async () => {
    mocks.getDb.mockReturnValue(dbReturning([{ id: "signup-1" }]));
    mocks.inviteEmail.mockResolvedValue({ code: "frederick-abcd", sent: false });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      sent: false,
      stored: true,
    });
    expect(mocks.inviteEmail).toHaveBeenCalledWith("tester@example.com");
  });

  it("retries delivery for a duplicate signup and reports success only after send", async () => {
    mocks.getDb.mockReturnValue(dbReturning([]));
    mocks.inviteEmail.mockResolvedValue({ code: "frederick-abcd", sent: true });

    const response = await POST(request(" Tester@Example.com "));

    expect(await response.json()).toEqual({
      ok: true,
      sent: true,
      stored: true,
    });
    expect(mocks.inviteEmail).toHaveBeenCalledWith("tester@example.com");
    expect(mocks.fanoutToTopic).not.toHaveBeenCalled();
  });
});
