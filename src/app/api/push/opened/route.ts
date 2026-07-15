/**
 * GET /api/push/opened?n=<push_log id> — a fire-and-forget open ping the
 * service worker sends when a notification is clicked. Increments that send's
 * open_count so the composer can show reach vs. opens.
 *
 * No auth by design: it only bumps an aggregate counter on a UUID it was
 * handed (worst case a click double-counts); it reads nothing and leaks
 * nothing. The id is shape-checked before the query.
 */
import { sql, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_log } from "@/lib/db/schema";
import { guardPushMutation, pushEmpty } from "@/lib/push-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  // This legacy analytics ping is a GET, but it mutates aggregate state, so it
  // receives the same strict source check and throttling as POST mutations.
  const guarded = await guardPushMutation(request, "push-opened", 60, 60);
  if (guarded) return guarded;

  const n = new URL(request.url).searchParams.get("n");
  if (!n || !UUID.test(n)) return pushEmpty();
  const db = getDb();
  if (db) {
    try {
      await db
        .update(push_log)
        // Replays can never inflate the aggregate beyond the number of pushes
        // actually accepted by providers for this send.
        .set({ open_count: sql`LEAST(${push_log.open_count} + 1, ${push_log.sent_count})` })
        .where(eq(push_log.id, n));
    } catch {
      /* best-effort analytics, never fails the click */
    }
  }
  return pushEmpty();
}
