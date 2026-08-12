import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  pushDeliveryFinalUpdate,
  pushOpenUpdate,
} from "./push-open-attribution";

const dialect = new PgDialect();

describe("push open attribution updates", () => {
  it("keeps the pre-accounting path idempotent and caps later opens at reach", () => {
    const compiled = dialect.sqlToQuery(pushOpenUpdate().open_count);

    expect(compiled.sql.replace(/\s+/g, " ").trim()).toBe(
      'CASE WHEN "push_log"."sent_count" = 0 THEN GREATEST("push_log"."open_count", 1) ELSE LEAST("push_log"."open_count" + 1, "push_log"."sent_count") END',
    );
    expect(compiled.params).toEqual([]);
  });

  it.each([
    { sent: 0, expectedParam: 0 },
    { sent: 4, expectedParam: 4 },
  ])(
    "atomically reconciles a provisional open against $sent accepted deliveries",
    ({ sent, expectedParam }) => {
      const update = pushDeliveryFinalUpdate(sent);
      const compiled = dialect.sqlToQuery(update.open_count);

      expect(update.sent_count).toBe(sent);
      expect(compiled.sql).toBe('LEAST("push_log"."open_count", $1)');
      expect(compiled.params).toEqual([expectedParam]);
    },
  );
});
