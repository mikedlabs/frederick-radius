import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  guardPushMutation: vi.fn(),
  pushEmpty: vi.fn((status = 204) => new Response(null, { status })),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/push-security", () => ({
  guardPushMutation: mocks.guardPushMutation,
  pushEmpty: mocks.pushEmpty,
}));

import { POST } from "./route";

function request(id = "11111111-1111-4111-8111-111111111111") {
  return new Request(`https://frederickradius.app/api/push/opened?n=${id}`, {
    method: "POST",
    headers: { origin: "https://frederickradius.app" },
  });
}

describe("push open attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardPushMutation.mockResolvedValue(null);
    mocks.where.mockResolvedValue(undefined);
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.getDb.mockReturnValue({ update: mocks.update });
  });

  it("uses the strict mutation guard before recording an open", async () => {
    const response = await POST(request());

    expect(response.status).toBe(204);
    expect(mocks.guardPushMutation).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" }),
      "push-opened",
      60,
      60,
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.where).toHaveBeenCalledTimes(1);
  });

  it("retains one bounded open while delivery accounting is still pending", async () => {
    await POST(request());

    const update = mocks.set.mock.calls[0]?.[0] as { open_count: SQL };
    const compiled = new PgDialect().sqlToQuery(update.open_count);
    expect(compiled.sql.replace(/\s+/g, " ").trim()).toBe(
      'CASE WHEN "push_log"."sent_count" = 0 THEN GREATEST("push_log"."open_count", 1) ELSE LEAST("push_log"."open_count" + 1, "push_log"."sent_count") END',
    );
    expect(compiled.params).toEqual([]);
  });

  it("rejects a malformed attribution id without touching the database", async () => {
    const response = await POST(request("not-a-push-id"));

    expect(response.status).toBe(204);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("stops before the database when the source guard rejects the request", async () => {
    mocks.guardPushMutation.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
