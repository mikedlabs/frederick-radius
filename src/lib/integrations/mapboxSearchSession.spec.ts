import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
  sql: vi.fn(),
  sqlBegin: vi.fn(),
}));

Object.assign(mocks.sql, { begin: mocks.sqlBegin });

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

import {
  MAPBOX_SEARCH_SESSION_MAX_SUGGESTIONS,
  MAPBOX_SEARCH_SESSION_TTL_SECONDS,
  reserveMapboxSearchSessionAction,
} from "./mapboxSearchSession";

const SESSION_TOKEN = "2d9f68fb-5d4c-4b28-9d8e-cc2e2bc6e99e";

function statementAt(index: number): { text: string; values: unknown[] } {
  const [strings, ...values] = mocks.sql.mock.calls[index] ?? [];
  return {
    text: Array.from(strings as TemplateStringsArray).join("?"),
    values,
  };
}

describe("Mapbox Search Box session lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSql.mockReturnValue(mocks.sql);
    mocks.sqlBegin.mockImplementation(
      async (callback: (tx: typeof mocks.sql) => Promise<unknown>) =>
        callback(mocks.sql),
    );
  });

  it("opens one hashed session and reserves one daily unit atomically", async () => {
    mocks.sql
      .mockResolvedValueOnce([{ suggestion_count: "1" }])
      .mockResolvedValueOnce([{ count: "7" }]);

    await expect(
      reserveMapboxSearchSessionAction(
        { action: "suggest", sessionToken: SESSION_TOKEN },
        75,
      ),
    ).resolves.toEqual({
      allowed: true,
      newSession: true,
      suggestionCount: 1,
      sessionClosed: false,
      dailyCount: 7,
    });

    expect(mocks.sqlBegin).toHaveBeenCalledOnce();
    expect(mocks.sql).toHaveBeenCalledTimes(2);
    const opened = statementAt(0);
    expect(opened.text).toContain("insert into mapbox_search_sessions");
    expect(opened.text).toContain("on conflict (session_token_hash) do nothing");
    expect(opened.values[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(opened.values).not.toContain(SESSION_TOKEN);
    expect(opened.values).toContain(MAPBOX_SEARCH_SESSION_TTL_SECONDS);

    const budget = statementAt(1);
    expect(budget.text).toContain("insert into usage_counters");
    expect(budget.text).toContain("where usage_counters.count + 1 <= ?");
    expect(budget.values).toEqual([75]);
  });

  it("advances an existing active session without reserving another daily unit", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { state: "active", suggestion_count: "1", expired: false },
      ])
      .mockResolvedValueOnce([{ state: "active", suggestion_count: "2" }]);

    await expect(
      reserveMapboxSearchSessionAction(
        { action: "suggest", sessionToken: SESSION_TOKEN },
        75,
      ),
    ).resolves.toEqual({
      allowed: true,
      newSession: false,
      suggestionCount: 2,
      sessionClosed: false,
    });

    expect(mocks.sql).toHaveBeenCalledTimes(3);
    expect(statementAt(1).text).toContain("for update");
    expect(statementAt(2).text).toContain("suggestion_count = suggestion_count + 1");
    expect(statementAt(2).values).toContain(
      MAPBOX_SEARCH_SESSION_MAX_SUGGESTIONS,
    );
    expect(mocks.sql.mock.calls.some((call) =>
      Array.from(call[0] as TemplateStringsArray)
        .join("?")
        .includes("insert into usage_counters"),
    )).toBe(false);
  });

  it("closes retrieve before upstream and stores only a hashed result id", async () => {
    mocks.sql
      .mockResolvedValueOnce([
        { state: "active", suggestion_count: "3", expired: false },
      ])
      .mockResolvedValueOnce([{ suggestion_count: "3" }]);

    await expect(
      reserveMapboxSearchSessionAction(
        {
          action: "retrieve",
          sessionToken: SESSION_TOKEN,
          mapboxId: "mapbox.place.1",
        },
        75,
      ),
    ).resolves.toEqual({
      allowed: true,
      newSession: false,
      suggestionCount: 3,
      sessionClosed: true,
    });

    expect(mocks.sql).toHaveBeenCalledTimes(2);
    const closed = statementAt(1);
    expect(closed.text).toContain("state = 'retrieved'");
    expect(closed.text).toContain("retrieved_mapbox_id_hash = ?");
    expect(closed.values[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(closed.values).not.toContain("mapbox.place.1");
  });

  it("rejects unknown retrieve and a previously closed UUID", async () => {
    mocks.sql.mockResolvedValueOnce([]);
    await expect(
      reserveMapboxSearchSessionAction(
        {
          action: "retrieve",
          sessionToken: SESSION_TOKEN,
          mapboxId: "mapbox.place.1",
        },
        75,
      ),
    ).resolves.toEqual({ allowed: false, reason: "session-missing" });

    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { state: "retrieved", suggestion_count: "2", expired: false },
      ]);
    await expect(
      reserveMapboxSearchSessionAction(
        { action: "suggest", sessionToken: SESSION_TOKEN },
        75,
      ),
    ).resolves.toEqual({ allowed: false, reason: "session-closed" });
  });

  it("marks a timed-out session closed and refuses the action", async () => {
    mocks.sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { state: "active", suggestion_count: "4", expired: true },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      reserveMapboxSearchSessionAction(
        { action: "suggest", sessionToken: SESSION_TOKEN },
        75,
      ),
    ).resolves.toEqual({ allowed: false, reason: "session-expired" });
    expect(statementAt(2).text).toContain("set state = 'expired'");
  });

  it("rolls back a new lifecycle row when the daily cap is exhausted", async () => {
    mocks.sql
      .mockResolvedValueOnce([{ suggestion_count: "1" }])
      .mockResolvedValueOnce([]);

    await expect(
      reserveMapboxSearchSessionAction(
        { action: "suggest", sessionToken: SESSION_TOKEN },
        9,
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: "daily-cap-reached",
      dailyCount: 9,
    });
  });

  it("fails closed when lifecycle storage is missing or inconsistent", async () => {
    mocks.getSql.mockReturnValueOnce(null);
    await expect(
      reserveMapboxSearchSessionAction(
        { action: "suggest", sessionToken: SESSION_TOKEN },
        75,
      ),
    ).resolves.toBeNull();

    mocks.getSql.mockReturnValue(mocks.sql);
    mocks.sqlBegin.mockRejectedValueOnce(new Error("table unavailable"));
    await expect(
      reserveMapboxSearchSessionAction(
        { action: "suggest", sessionToken: SESSION_TOKEN },
        75,
      ),
    ).resolves.toBeNull();
  });
});
