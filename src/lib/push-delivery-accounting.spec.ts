import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getSql: vi.fn(),
  configurePush: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: mocks.getDb,
  getSql: mocks.getSql,
}));
vi.mock("@/lib/push", () => ({
  configurePush: mocks.configurePush,
  sendPush: mocks.sendPush,
}));

import { broadcast } from "./push-broadcast";
import { fanoutToTopic } from "./push-fanout";
import { OWNER_ALERTS_TOPIC } from "./push-topics";

const PUSH_ID = "11111111-1111-4111-8111-111111111111";

function emptyAudienceDb() {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const returning = vi.fn(async () => [{ id: PUSH_ID }]);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  const audienceWhere = vi.fn(async () => []);
  const from = vi.fn(() => ({ where: audienceWhere }));
  const select = vi.fn(() => ({ from }));

  return {
    db: { insert, select, update },
    set,
    update,
  };
}

function audienceDb(rows: Array<{
  endpoint: string;
  p256dh: string;
  auth: string;
  quiet_start: number | null;
  quiet_end: number | null;
}>) {
  const updateWhere = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  const returning = vi.fn(async () => [{ id: PUSH_ID }]);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  const audienceWhere = vi.fn(async () => rows);
  const from = vi.fn(() => ({ where: audienceWhere }));
  const select = vi.fn(() => ({ from }));

  return { db: { insert, select, update }, set, update };
}

function retryableOwnerAudienceDb(rows: Array<{
  endpoint: string;
  p256dh: string;
  auth: string;
  quiet_start: number | null;
  quiet_end: number | null;
}>) {
  const claimedKeys = new Set<string>();
  let lastClaimedKey: string | null = null;
  let nextId = 0;
  const insert = vi.fn(() => ({
    values: vi.fn((value: { dedupe_key: string }) => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(async () => {
          if (claimedKeys.has(value.dedupe_key)) return [];
          claimedKeys.add(value.dedupe_key);
          lastClaimedKey = value.dedupe_key;
          nextId += 1;
          return [{ id: `11111111-1111-4111-8111-${String(nextId).padStart(12, "0")}` }];
        }),
      })),
    })),
  }));
  const deleteWhere = vi.fn(async () => {
    if (lastClaimedKey) claimedKeys.delete(lastClaimedKey);
  });
  const remove = vi.fn(() => ({ where: deleteWhere }));
  const updateWhere = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  const audienceWhere = vi.fn(async () => rows);
  const from = vi.fn(() => ({ where: audienceWhere }));
  const select = vi.fn(() => ({ from }));

  return { db: { insert, select, update, delete: remove } };
}

function expectZeroDeliveryReconciliation(set: ReturnType<typeof vi.fn>) {
  expect(set).toHaveBeenCalledTimes(1);
  const update = set.mock.calls[0]?.[0] as {
    sent_count: number;
    open_count: SQL;
  };
  const compiled = new PgDialect().sqlToQuery(update.open_count);
  expect(update.sent_count).toBe(0);
  expect(compiled.sql).toBe('LEAST("push_log"."open_count", $1)');
  expect(compiled.params).toEqual([0]);
}

describe("push delivery accounting", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configurePush.mockReturnValue(true);
    mocks.getSql.mockReturnValue(null);
  });

  it("finalizes a scheduled fan-out even when no delivery succeeds", async () => {
    const { db, set } = emptyAudienceDb();
    mocks.getDb.mockReturnValue(db);

    await expect(
      fanoutToTopic("civic-alerts", "alert:1", {
        title: "Road closed",
        body: "Market Street is closed.",
        url: "/pulse",
      }),
    ).resolves.toEqual({
      claimed: true,
      attempted: 0,
      sent: 0,
      gone: 0,
      held: 0,
    });

    expectZeroDeliveryReconciliation(set);
  });

  it("finalizes an owner broadcast even when no delivery succeeds", async () => {
    const { db, set } = emptyAudienceDb();
    mocks.getDb.mockReturnValue(db);

    await expect(
      broadcast(
        { kind: "all" },
        {
          title: "Tonight in Frederick",
          body: "One useful local update.",
          url: "/today",
        },
      ),
    ).resolves.toEqual({ attempted: 0, sent: 0, gone: 0, held: 0 });

    expectZeroDeliveryReconciliation(set);
  });

  it("does not count a provider failure as a scheduled delivery", async () => {
    const { db, set, update } = audienceDb([
      {
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test",
        p256dh: "key",
        auth: "auth",
        quiet_start: null,
        quiet_end: null,
      },
    ]);
    mocks.getDb.mockReturnValue(db);
    mocks.sendPush.mockResolvedValue(null);

    await expect(
      fanoutToTopic("civic-alerts", "alert:provider-failed", {
        title: "Road closed",
        body: "Market Street is closed.",
        url: "/pulse",
      }),
    ).resolves.toEqual({
      claimed: true,
      attempted: 1,
      sent: 0,
      gone: 0,
      held: 0,
    });

    expectZeroDeliveryReconciliation(set);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does not count a provider failure as a broadcast delivery", async () => {
    const { db, set } = audienceDb([
      {
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test",
        p256dh: "key",
        auth: "auth",
        quiet_start: null,
        quiet_end: null,
      },
    ]);
    mocks.getDb.mockReturnValue(db);
    mocks.sendPush.mockResolvedValue(null);

    await expect(
      broadcast(
        { kind: "all" },
        {
          title: "Tonight in Frederick",
          body: "One useful local update.",
          url: "/today",
        },
      ),
    ).resolves.toEqual({ attempted: 1, sent: 0, gone: 0, held: 0 });

    expectZeroDeliveryReconciliation(set);
  });

  it("delivers private owner alerts immediately instead of losing them to quiet hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T02:00:00-04:00"));
    const { db } = audienceDb([
      {
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test",
        p256dh: "key",
        auth: "auth",
        quiet_start: 21,
        quiet_end: 7,
      },
    ]);
    mocks.getDb.mockReturnValue(db);
    mocks.sendPush.mockResolvedValue({ statusCode: 201, headers: {}, body: "" });

    await expect(
      fanoutToTopic(OWNER_ALERTS_TOPIC, "feedback:1", {
        title: "Site feedback",
        body: "A new note is waiting.",
        url: "/admin/beta",
      }),
    ).resolves.toEqual({
      claimed: true,
      attempted: 1,
      sent: 1,
      gone: 0,
      held: 0,
    });

    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
  });

  it("retries only failed owner devices without duplicating accepted devices", async () => {
    const firstEndpoint =
      "https://updates.push.services.mozilla.com/wpush/v2/accepted";
    const retryEndpoint =
      "https://updates.push.services.mozilla.com/wpush/v2/retry";
    const { db } = retryableOwnerAudienceDb([
      {
        endpoint: firstEndpoint,
        p256dh: "key-a",
        auth: "auth-a",
        quiet_start: null,
        quiet_end: null,
      },
      {
        endpoint: retryEndpoint,
        p256dh: "key-b",
        auth: "auth-b",
        quiet_start: null,
        quiet_end: null,
      },
    ]);
    mocks.getDb.mockReturnValue(db);
    mocks.sendPush
      .mockResolvedValueOnce({ statusCode: 201, headers: {}, body: "" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ statusCode: 201, headers: {}, body: "" });

    const payload = {
      title: "Site feedback",
      body: "A new note is waiting.",
      url: "/admin/beta",
    };
    await expect(
      fanoutToTopic(OWNER_ALERTS_TOPIC, "feedback:mixed", payload),
    ).resolves.toEqual({
      claimed: true,
      attempted: 2,
      sent: 1,
      gone: 0,
      held: 0,
    });
    await expect(
      fanoutToTopic(OWNER_ALERTS_TOPIC, "feedback:mixed", payload),
    ).resolves.toEqual({
      claimed: true,
      attempted: 1,
      sent: 1,
      gone: 0,
      held: 0,
    });

    expect(
      mocks.sendPush.mock.calls.map(([subscription]) => subscription.endpoint),
    ).toEqual([firstEndpoint, retryEndpoint, retryEndpoint]);
  });
});
