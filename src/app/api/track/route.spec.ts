import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readJsonBodyWithLimit: vi.fn(),
  getDb: vi.fn(),
  verifyMemberCookie: vi.fn(),
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readJsonBodyWithLimit: mocks.readJsonBodyWithLimit,
}));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/beta-gate", () => ({ verifyMemberCookie: mocks.verifyMemberCookie }));

import { POST } from "./route";

function request(body: string = "{}") {
  return new NextRequest("https://frederickradius.app/api/track", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://frederickradius.app",
      "x-forwarded-for": "198.51.100.9",
    },
    body,
  });
}

/** A drizzle-ish db: member lookup returns `member` (or none); event insert resolves. */
function fakeDb({ member }: { member?: { opted_out: boolean } | null }) {
  const limitMock = vi.fn().mockResolvedValue(member ? [member] : []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const valuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return { db: { select: selectMock, insert: insertMock }, insertMock, valuesMock };
}

const MEMBER_ID = "aGVsbG8td29ybGQtaWQ";

describe("POST /api/track guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSameOriginMutationRequest.mockReturnValue(true);
    mocks.isRateLimited.mockResolvedValue(false);
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: { event: "page_view", path: "/today" },
    });
    mocks.verifyMemberCookie.mockResolvedValue(MEMBER_ID);
  });

  it("rejects a cross-origin request before reading the body or the cookie", async () => {
    mocks.isSameOriginMutationRequest.mockReturnValue(false);
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(mocks.readJsonBodyWithLimit).not.toHaveBeenCalled();
    expect(mocks.verifyMemberCookie).not.toHaveBeenCalled();
  });

  it("429s when rate-limited", async () => {
    mocks.isRateLimited.mockResolvedValue(true);
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(mocks.readJsonBodyWithLimit).not.toHaveBeenCalled();
  });

  it("400s an empty event name", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({ ok: true, value: { event: "  " } });
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(mocks.verifyMemberCookie).not.toHaveBeenCalled();
  });

  it("drops with 204 when there is no member cookie, without touching the DB", async () => {
    mocks.verifyMemberCookie.mockResolvedValue(null);
    const res = await POST(request());
    expect(res.status).toBe(204);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the database is unconfigured", async () => {
    mocks.getDb.mockReturnValue(null);
    const res = await POST(request());
    expect(res.status).toBe(503);
  });

  it("drops with 204 and never inserts when the member opted out", async () => {
    const { db, insertMock } = fakeDb({ member: { opted_out: true } });
    mocks.getDb.mockReturnValue(db);
    const res = await POST(request());
    expect(res.status).toBe(204);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("drops with 204 for an unknown member id (no matching row)", async () => {
    const { db, insertMock } = fakeDb({ member: null });
    mocks.getDb.mockReturnValue(db);
    const res = await POST(request());
    expect(res.status).toBe(204);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts one event on the happy path and returns 204", async () => {
    const { db, insertMock, valuesMock } = fakeDb({ member: { opted_out: false } });
    mocks.getDb.mockReturnValue(db);
    const res = await POST(request());
    expect(res.status).toBe(204);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ member_id: MEMBER_ID, event: "page_view", path: "/today" }),
    );
  });

  it("400s an event name that is not a code-defined slug", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({ ok: true, value: { event: "page view!" } });
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(mocks.verifyMemberCookie).not.toHaveBeenCalled();
  });

  it("strips free-text query props before writing to the member-linked log", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "search_empty",
        path: "/search",
        props: { query: "std clinic near me", category: "health" },
      },
    });
    const { db, valuesMock } = fakeDb({ member: { opted_out: false } });
    mocks.getDb.mockReturnValue(db);
    const res = await POST(request());
    expect(res.status).toBe(204);
    const written = valuesMock.mock.calls[0][0] as { props?: Record<string, unknown> };
    // The categorical prop survives; the typed query never lands in the log.
    expect(written.props).toEqual({ category: "health" });
    expect(written.props).not.toHaveProperty("query");
  });
});
