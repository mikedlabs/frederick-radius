/**
 * POST /api/push/opened?n=<push_log id> — the open ping the service worker
 * sends when a notification is clicked. Increments that send's open_count so
 * the composer can show reach vs. opens.
 *
 * No auth by design: it only bumps an aggregate counter on a UUID it was
 * handed (worst case a click double-counts); it reads nothing and leaks
 * nothing. The id is shape-checked before the query.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_log } from "@/lib/db/schema";
import { pushOpenUpdate } from "@/lib/push-open-attribution";
import { guardPushMutation, pushEmpty } from "@/lib/push-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  // A click changes aggregate state, so use POST. Same-origin POST fetches
  // carry the browser's Origin header; the mutation guard can therefore reject
  // cross-site requests without also rejecting a service-worker click.
  const guarded = await guardPushMutation(request, "push-opened", 60, 60);
  if (guarded) return guarded;

  const n = new URL(request.url).searchParams.get("n");
  if (!n || !UUID.test(n)) return pushEmpty();
  const db = getDb();
  if (db) {
    try {
      await db
        .update(push_log)
        // The helper preserves one idempotent open while sent_count is still
        // landing, then caps normal opens at the accepted delivery count.
        .set(pushOpenUpdate())
        .where(eq(push_log.id, n));
    } catch {
      /* best-effort analytics, never fails the click */
    }
  }
  return pushEmpty();
}
