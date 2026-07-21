import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  isRateLimited: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/origin-check", () => ({ isRateLimited: mocks.isRateLimited }));

import { GET } from "./route";
import { BETA_COOKIE, signMemberId } from "@/lib/beta-gate";
import { MEMBER_COOKIE } from "@/lib/nfc-constants";

const CODE = "a3kq-7mtp";

function request(code: string = CODE) {
  return new NextRequest(`https://frederickradius.app/j/${code}`, {
    method: "GET",
    headers: { "x-forwarded-for": "198.51.100.7" },
  });
}

function call(req: NextRequest, code: string = CODE) {
  return GET(req, { params: Promise.resolve({ code }) });
}

function locationPath(res: Response): string {
  return new URL(res.headers.get("location") ?? "https://x.test/").pathname;
}

/** A drizzle-ish db: card lookup returns `card` (or none); member insert resolves.
 *  `values()` returns an object that is both awaitable (new-member branch) and
 *  carries `onConflictDoUpdate` (re-tap upsert branch). */
function fakeDb({ card }: { card?: { code: string; active: boolean } }) {
  const limitMock = vi.fn().mockResolvedValue(card ? [card] : []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return {
    db: { select: selectMock, insert: insertMock },
    selectMock,
    insertMock,
    valuesMock,
    onConflictDoUpdateMock,
  };
}

describe("GET /j/<code> tap route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
    // A signing secret must exist for the unlock + member cookies to mint.
    process.env.BETA_CODE_SECRET = "test-secret-for-nfc";
  });

  afterEach(() => {
    delete process.env.BETA_CODE_SECRET;
  });

  it("rate-limits a malformed code before redirecting to /beta, and never touches the DB", async () => {
    const res = await call(request("Bad Code!"), "Bad Code!");
    expect(res.status).toBe(307);
    expect(locationPath(res)).toBe("/beta");
    // The limiter runs BEFORE the regex, so garbage probes still cost a slot.
    expect(mocks.isRateLimited).toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("redirects to /beta when rate-limited, before any DB work", async () => {
    mocks.isRateLimited.mockResolvedValue(true);
    const res = await call(request());
    expect(locationPath(res)).toBe("/beta");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("fails closed to /beta when the database is unconfigured", async () => {
    mocks.getDb.mockReturnValue(null);
    const res = await call(request());
    expect(locationPath(res)).toBe("/beta");
  });

  it("redirects an unknown card to /beta and never creates a member", async () => {
    const { db, insertMock } = fakeDb({});
    mocks.getDb.mockReturnValue(db);
    const res = await call(request());
    expect(locationPath(res)).toBe("/beta");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("redirects an inactive card to /beta (same response as unknown)", async () => {
    const { db, insertMock } = fakeDb({ card: { code: CODE, active: false } });
    mocks.getDb.mockReturnValue(db);
    const res = await call(request());
    expect(locationPath(res)).toBe("/beta");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("unlocks a valid card: assigns a member and drops the device at /today", async () => {
    const { db, insertMock } = fakeDb({ card: { code: CODE, active: true } });
    mocks.getDb.mockReturnValue(db);

    const res = await call(request());

    expect(res.status).toBe(307);
    expect(locationPath(res)).toBe("/today");
    // A new member row is created, attributed to this card.
    expect(insertMock).toHaveBeenCalledTimes(1);
    // The unlock cookie (verified by middleware) and the signed member cookie are set.
    expect(res.cookies.get(BETA_COOKIE)?.value).toBeTruthy();
    expect(res.cookies.get(MEMBER_COOKIE)?.value).toBeTruthy();
  });

  it("re-tap with a valid member cookie reuses the id (one upsert) and re-signs it", async () => {
    const existingId = "existing-member-id-1234";
    const signed = await signMemberId(existingId);
    expect(signed).toBeTruthy();
    const { db, insertMock, onConflictDoUpdateMock } = fakeDb({ card: { code: CODE, active: true } });
    mocks.getDb.mockReturnValue(db);

    const req = new NextRequest(`https://frederickradius.app/j/${CODE}`, {
      method: "GET",
      headers: { "x-forwarded-for": "198.51.100.7", cookie: `${MEMBER_COOKIE}=${signed}` },
    });
    const res = await call(req);

    expect(locationPath(res)).toBe("/today");
    // The re-tap branch upserts (last_seen_at bump), not a fresh insert.
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    // Same id, deterministically re-signed — the member keeps its identity.
    expect(res.cookies.get(MEMBER_COOKIE)?.value).toBe(signed);
  });

  it("ignores a forged member cookie and mints a fresh id instead", async () => {
    const { db, insertMock, onConflictDoUpdateMock } = fakeDb({ card: { code: CODE, active: true } });
    mocks.getDb.mockReturnValue(db);

    const req = new NextRequest(`https://frederickradius.app/j/${CODE}`, {
      method: "GET",
      headers: {
        "x-forwarded-for": "198.51.100.7",
        cookie: `${MEMBER_COOKIE}=m1~forged-member-id-9999~deadbeefdeadbeefdeadbeefdeadbeef`,
      },
    });
    const res = await call(req);

    expect(locationPath(res)).toBe("/today");
    // Forged cookie fails verification → new-member branch (plain insert, no upsert).
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdateMock).not.toHaveBeenCalled();
    expect(res.cookies.get(MEMBER_COOKIE)?.value).not.toContain("forged-member-id-9999");
  });

  it("fails closed to /beta when no signing secret is configured", async () => {
    delete process.env.BETA_CODE_SECRET;
    delete process.env.BETA_PASSWORD;
    const { db } = fakeDb({ card: { code: CODE, active: true } });
    mocks.getDb.mockReturnValue(db);
    const res = await call(request());
    expect(locationPath(res)).toBe("/beta");
  });
});
