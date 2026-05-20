/**
 * Remove a Web Push subscription by endpoint. Idempotent — calling
 * with a stale endpoint returns 200 and a count of 0.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";

export const runtime = "nodejs";

type Body = { endpoint?: string };

export async function POST(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Push not configured on this deployment." },
      { status: 503 },
    );
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }
  try {
    const deleted = await db
      .delete(push_subscriptions)
      .where(eq(push_subscriptions.endpoint, body.endpoint))
      .returning({ id: push_subscriptions.id });
    return NextResponse.json({ ok: true, removed: deleted.length });
  } catch (err) {

    console.error("[push/unsubscribe] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "DB delete failed." }, { status: 500 });
  }
}
