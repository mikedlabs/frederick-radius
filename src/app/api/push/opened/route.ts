/**
 * GET /api/push/opened?n=<push_log id> — a fire-and-forget open ping the
 * service worker sends when a notification is clicked. Increments that send's
 * open_count so the composer can show reach vs. opens.
 *
 * No auth by design: it only bumps an aggregate counter on a UUID it was
 * handed (worst case a click double-counts); it reads nothing and leaks
 * nothing. The id is shape-checked before the query.
 */
import { NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_log } from "@/lib/db/schema";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const n = new URL(request.url).searchParams.get("n");
  if (!n || !UUID.test(n)) return new NextResponse(null, { status: 204 });
  const db = getDb();
  if (db) {
    try {
      await db
        .update(push_log)
        .set({ open_count: sql`${push_log.open_count} + 1` })
        .where(eq(push_log.id, n));
    } catch {
      /* best-effort analytics, never fails the click */
    }
  }
  return new NextResponse(null, { status: 204 });
}
