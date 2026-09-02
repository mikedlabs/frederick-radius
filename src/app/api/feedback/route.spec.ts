import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readJsonBodyWithLimit: vi.fn(),
  getDb: vi.fn(),
  fanoutToTopic: vi.fn(),
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readJsonBodyWithLimit: mocks.readJsonBodyWithLimit,
}));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/push-fanout", () => ({
  fanoutToTopic: mocks.fanoutToTopic,
}));

import { POST } from "./route";

const PRIVATE_MESSAGE = "My child needs help near Gate 3.";
const PRIVATE_EMAIL = "visitor@example.com";

function request() {
  return new NextRequest("https://frederickradius.app/api/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://frederickradius.app",
      "x-forwarded-for": "198.51.100.42",
    },
    body: "{}",
  });
}

function fakeDb({
  inserted = [{ id: "feedback-id-123" }],
  insertError,
}: {
  inserted?: Array<{ id: string }>;
  insertError?: Error;
} = {}) {
  const returning = insertError
    ? vi.fn().mockRejectedValue(insertError)
    : vi.fn().mockResolvedValue(inserted);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return { db: { insert }, insert, values, returning };
}

function loggedText(spy: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(spy.mock.calls);
}

describe("POST /api/feedback durable receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        message: PRIVATE_MESSAGE,
        email: PRIVATE_EMAIL,
        pathname: "/moments/great-frederick-fair-2026",
        fairIssue: "restroom_help",
        fairContext: "Gate 3 family area",
      },
    });
    mocks.fanoutToTopic.mockResolvedValue({
      claimed: true,
      attempted: 1,
      sent: 1,
      gone: 0,
      held: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a retryable 503 when durable storage is unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getDb.mockReturnValue(null);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.json()).toEqual({
      ok: false,
      error: "feedback-storage-unavailable",
    });
    expect(mocks.fanoutToTopic).not.toHaveBeenCalled();
    expect(loggedText(error)).not.toContain(PRIVATE_MESSAGE);
    expect(loggedText(error)).not.toContain(PRIVATE_EMAIL);
  });

  it("does not claim receipt or log visitor data when the insert fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb({
      insertError: new Error(
        `insert failed for ${PRIVATE_MESSAGE} ${PRIVATE_EMAIL}`,
      ),
    });
    mocks.getDb.mockReturnValue(db);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "feedback-storage-unavailable",
    });
    expect(mocks.fanoutToTopic).not.toHaveBeenCalled();
    expect(loggedText(error)).toContain("durable storage failed");
    expect(loggedText(error)).not.toContain(PRIVATE_MESSAGE);
    expect(loggedText(error)).not.toContain(PRIVATE_EMAIL);
  });

  it("keeps a stored report successful when owner push throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, returning } = fakeDb();
    mocks.getDb.mockReturnValue(db);
    mocks.fanoutToTopic.mockRejectedValue(
      new Error(`push failed for ${PRIVATE_MESSAGE} ${PRIVATE_EMAIL}`),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(returning).toHaveBeenCalledTimes(1);
    expect(mocks.fanoutToTopic).toHaveBeenCalledTimes(1);
    expect(loggedText(error)).toContain("owner alert failed");
    expect(loggedText(error)).toContain("feedback-id-123");
    expect(loggedText(error)).not.toContain(PRIVATE_MESSAGE);
    expect(loggedText(error)).not.toContain(PRIVATE_EMAIL);
  });

  it("records a safely bounded delivery summary when no owner push arrives", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db } = fakeDb();
    mocks.getDb.mockReturnValue(db);
    mocks.fanoutToTopic.mockResolvedValue({
      claimed: true,
      attempted: 1,
      sent: 0,
      gone: 1,
      held: 0,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(loggedText(warn)).toContain("owner alert not delivered");
    expect(loggedText(warn)).toContain("feedback-id-123");
    expect(loggedText(warn)).not.toContain(PRIVATE_MESSAGE);
    expect(loggedText(warn)).not.toContain(PRIVATE_EMAIL);
  });
});
