import "server-only";
import { sql } from "drizzle-orm";
import { eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions, push_log } from "@/lib/db/schema";
import { sendPush, configurePush } from "@/lib/push";
import type { PushPayload } from "./push";

/**
 * Fan one payload out to every subscription opted into `topic`.
 *
 *   1. Claim the (topic, dedupe_key) pair via INSERT … ON CONFLICT
 *      DO NOTHING. If the insert created no row, this payload was
 *      already sent and we exit silently — that's how the same cron
 *      can run safely from multiple workers and across deploys.
 *   2. Pull every subscription whose `topics` jsonb contains the
 *      topic string.
 *   3. Send the push to each, in serial (~ms per call; the volume is
 *      tiny). On a 404/410, delete the dead subscription so we never
 *      try that endpoint again.
 *
 * Returns { claimed, attempted, sent, gone } so the caller can log
 * what happened.
 */
export async function fanoutToTopic(
  topic: string,
  dedupeKey: string,
  payload: PushPayload,
): Promise<{ claimed: boolean; attempted: number; sent: number; gone: number }> {
  const db = getDb();
  if (!db) return { claimed: false, attempted: 0, sent: 0, gone: 0 };
  if (!configurePush()) return { claimed: false, attempted: 0, sent: 0, gone: 0 };

  // Step 1 — claim the dedupe key. The unique index on (topic,
  // dedupe_key) plus ON CONFLICT DO NOTHING means at most one row
  // is inserted across the whole fleet for this payload.
  const claim = await db
    .insert(push_log)
    .values({
      topic,
      dedupe_key: dedupeKey,
      title: payload.title,
      body: payload.body,
      url: payload.url,
    })
    .onConflictDoNothing({ target: [push_log.topic, push_log.dedupe_key] })
    .returning({ id: push_log.id });

  if (claim.length === 0) {
    return { claimed: false, attempted: 0, sent: 0, gone: 0 };
  }

  // Step 2 — subscribers in this topic.
  const rows = await db
    .select({
      endpoint: push_subscriptions.endpoint,
      p256dh: push_subscriptions.p256dh,
      auth: push_subscriptions.auth,
    })
    .from(push_subscriptions)
    .where(sql`${push_subscriptions.topics} ? ${topic}`);

  // Step 3 — send each. Gone subs get pruned.
  let sent = 0;
  let gone = 0;
  for (const row of rows) {
    try {
      await sendPush(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      );
      sent += 1;
    } catch (err) {
      if (err instanceof Error && err.message === "subscription_gone") {
        gone += 1;
        try {
          await db
            .delete(push_subscriptions)
            .where(eq(push_subscriptions.endpoint, row.endpoint));
        } catch {}
      } else {
        console.error(`[fanout] ${topic}: send failed for ${row.endpoint.slice(0, 40)}…`);
      }
    }
  }

  // Record the final delivered count for visibility.
  if (sent > 0) {
    await db
      .update(push_log)
      .set({ sent_count: sent })
      .where(eq(push_log.id, claim[0].id));
  }

  return { claimed: true, attempted: rows.length, sent, gone };
}

/**
 * Prune push_log rows older than `days`. The table is append-only
 * for dedupe — every fanout attempt writes one row — so without
 * a periodic prune it would grow unbounded over the life of the app.
 *
 * Same retention shape as `pruneOldSnapshots`: 90 days covers any
 * realistic re-publish window for civic alerts (the longest-lived
 * dedupe key, since NWS alerts can sit active for days), and keeps
 * the table small. Returns the count deleted so the cron can
 * report it. No-op when DB unavailable.
 */
export async function prunePushLog(days: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  try {
    const deleted = await db
      .delete(push_log)
      .where(lt(push_log.sent_at, cutoff))
      .returning({ id: push_log.id });
    return deleted.length;
  } catch (err) {
    console.error(
      "[push-fanout] prune failed:",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}
