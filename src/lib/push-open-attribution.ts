import "server-only";
import { sql } from "drizzle-orm";
import { push_log } from "@/lib/db/schema";

/**
 * Record an open without losing the click when delivery accounting is still
 * in flight. A zero sent_count is the short window between the provider
 * accepting a push and fan-out persisting its final count. In that window we
 * retain one provisional open; repeated pings stay at one rather than growing
 * an unbounded counter.
 */
export function pushOpenUpdate() {
  return {
    open_count: sql<number>`CASE
      WHEN ${push_log.sent_count} = 0
        THEN GREATEST(${push_log.open_count}, 1)
      ELSE LEAST(${push_log.open_count} + 1, ${push_log.sent_count})
    END`,
  };
}

/**
 * Persist the provider-accepted delivery count and reconcile any provisional
 * open in the same row update. This preserves a real early open when at least
 * one push landed and clears it when no delivery succeeded.
 */
export function pushDeliveryFinalUpdate(sentCount: number) {
  return {
    sent_count: sentCount,
    open_count: sql<number>`LEAST(${push_log.open_count}, ${sentCount})`,
  };
}
