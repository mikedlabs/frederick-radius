import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
