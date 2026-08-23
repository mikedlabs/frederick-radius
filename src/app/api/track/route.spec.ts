import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isSameOriginMutationRequest: vi.fn(),
  isRateLimited: vi.fn(),
  readJsonBodyWithLimit: vi.fn(),
  getDb: vi.fn(),
  verifyMemberCookie: vi.fn(),
  recordSearchMiss: vi.fn(),
}));

vi.mock("@/lib/origin-check", () => ({
  isSameOriginMutationRequest: mocks.isSameOriginMutationRequest,
  isRateLimited: mocks.isRateLimited,
  readJsonBodyWithLimit: mocks.readJsonBodyWithLimit,
}));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/beta-gate", () => ({ verifyMemberCookie: mocks.verifyMemberCookie }));
vi.mock("@/lib/telemetry/searchMiss", () => ({
  recordSearchMiss: mocks.recordSearchMiss,
}));

import { POST } from "./route";

function request(body: string = "{}", cookie?: string) {
  return new NextRequest("https://frederickradius.app/api/track", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://frederickradius.app",
      "x-forwarded-for": "198.51.100.9",
      ...(cookie ? { cookie } : {}),
    },
    body,
  });
}

/** A drizzle-ish db with member lookup, member insert, and aggregate upsert. */
function fakeDb({
  member,
  aggregateError = false,
}: {
  member?: { opted_out: boolean } | null;
  aggregateError?: boolean;
}) {
  const limitMock = vi.fn().mockResolvedValue(member ? [member] : []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const onConflictDoUpdateMock = aggregateError
    ? vi.fn().mockRejectedValue(new Error("aggregate unavailable"))
    : vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn((value: Record<string, unknown>) => {
    if ("day" in value && "surface" in value) return { onConflictDoUpdate: onConflictDoUpdateMock };
    return Promise.resolve(undefined);
  });
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return {
    db: { select: selectMock, insert: insertMock },
    insertMock,
    memberLookupMock: limitMock,
    valuesMock,
    onConflictDoUpdateMock,
  };
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

  it("increments an anonymous decision aggregate without storing entity or route data", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "decision_action",
        path: "/places/cafe-nola-frederick?from=ask",
        props: {
          surface: "ask",
          entity_kind: "place",
          entity_id: "cafe-nola-frederick",
          position: "lead",
          action: "directions",
        },
      },
    });
    mocks.verifyMemberCookie.mockResolvedValue(null);
    const { db, valuesMock, onConflictDoUpdateMock } = fakeDb({ member: null });
    mocks.getDb.mockReturnValue(db);

    const res = await POST(request());

    expect(res.status).toBe(204);
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(1);
    const aggregate = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(aggregate).toMatchObject({
      surface: "ask",
      stage: "action",
      entity_kind: "place",
      position: "lead",
      action: "directions",
      count: 1,
    });
    expect(aggregate).not.toHaveProperty("entity_id");
    expect(aggregate).not.toHaveProperty("path");
    expect(aggregate).not.toHaveProperty("member_id");
  });

  it("rejects arbitrary dimensions in the reserved decision namespace", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "decision_action",
        props: {
          surface: "ask",
          entity_kind: "place",
          entity_id: "cafe-nola-frederick",
          position: "lead",
          action: "directions",
          query: "coffee and bikes",
        },
      },
    });

    const res = await POST(request());

    expect(res.status).toBe(400);
    expect(mocks.verifyMemberCookie).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("honors the anonymous analytics opt-out cookie before identity or DB work", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "decision_impression",
        props: {
          surface: "today",
          entity_kind: "place",
          entity_id: "cafe-nola-frederick",
          position: "lead",
        },
      },
    });

    const res = await POST(request("{}", "fr_analytics_optout=1"));

    expect(res.status).toBe(204);
    expect(mocks.verifyMemberCookie).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("does not bank a search miss when the analytics opt-out cookie is set", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "search_empty",
        props: { query: "private medical search" },
      },
    });

    const res = await POST(request("{}", "fr_analytics_optout=1"));

    expect(res.status).toBe(204);
    expect(mocks.recordSearchMiss).not.toHaveBeenCalled();
    expect(mocks.verifyMemberCookie).not.toHaveBeenCalled();
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

  it("does not bank a search miss for a persisted opted-out member", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "search_empty",
        props: { query: "private medical search" },
      },
    });
    const { db, insertMock } = fakeDb({ member: { opted_out: true } });
    mocks.getDb.mockReturnValue(db);

    const res = await POST(request());

    expect(res.status).toBe(204);
    expect(mocks.recordSearchMiss).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does not aggregate a decision from a persisted opted-out member", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "decision_impression",
        props: {
          surface: "today",
          entity_kind: "place",
          entity_id: "cafe-nola-frederick",
          position: "lead",
        },
      },
    });
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

  it("does not bank a search miss for an unknown signed member", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "search_empty",
        props: { query: "private medical search" },
      },
    });
    const { db, insertMock } = fakeDb({ member: null });
    mocks.getDb.mockReturnValue(db);

    const res = await POST(request());

    expect(res.status).toBe(204);
    expect(mocks.recordSearchMiss).not.toHaveBeenCalled();
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

  it("keeps member logging when the anonymous aggregate write fails", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "decision_open",
        path: "/events/alive-at-five-2026",
        props: {
          surface: "events",
          entity_kind: "event",
          entity_id: "alive-at-five-2026",
          position: "lead",
          action: "open",
        },
      },
    });
    const { db, valuesMock, onConflictDoUpdateMock } = fakeDb({
      member: { opted_out: false },
      aggregateError: true,
    });
    mocks.getDb.mockReturnValue(db);

    const res = await POST(request());

    expect(res.status).toBe(204);
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(2);
    expect(valuesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        member_id: MEMBER_ID,
        event: "decision_open",
        path: "/events/alive-at-five-2026",
      }),
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
    const { db, memberLookupMock, valuesMock } = fakeDb({ member: { opted_out: false } });
    mocks.getDb.mockReturnValue(db);
    const res = await POST(request());
    expect(res.status).toBe(204);
    const written = valuesMock.mock.calls[0][0] as { props?: Record<string, unknown> };
    // The categorical prop survives; the typed query never lands in the log.
    expect(written.props).toEqual({ category: "health" });
    expect(written.props).not.toHaveProperty("query");
    expect(mocks.recordSearchMiss).toHaveBeenCalledWith("std clinic near me", "search");
    expect(memberLookupMock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recordSearchMiss.mock.invocationCallOrder[0],
    );
  });

  it("banks a settled anonymous search miss without creating a member event", async () => {
    mocks.readJsonBodyWithLimit.mockResolvedValue({
      ok: true,
      value: {
        event: "search_empty",
        path: "/today",
        props: { query: "wheelchair accessible patio" },
      },
    });
    mocks.verifyMemberCookie.mockResolvedValue(null);

    const res = await POST(request());

    expect(res.status).toBe(204);
    expect(mocks.recordSearchMiss).toHaveBeenCalledWith(
      "wheelchair accessible patio",
      "search",
    );
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
