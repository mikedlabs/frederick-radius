/**
 * Store (or upsert) a Web Push subscription.
 *
 * Body shape:
 *   {
 *     subscription: PushSubscription,   // from pushManager.subscribe
 *     topics: string[],                 // ["civic-alerts", ...]
 *     device_id?: string                // optional client-managed id
 *   }
 *
 * The subscription's `endpoint` is the natural key — re-subscribing
 * from the same browser overwrites the row (topics + last_seen_at).
 *
 * Drops silently into a 503 when the DB is unconfigured so the client
 * can fall back to "this server hasn't enabled notifications yet."
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";

export const runtime = "nodejs";

type Body = {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  topics?: string[];
  device_id?: string;
};

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
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json(
      { error: "subscription must include endpoint + keys.p256dh + keys.auth" },
      { status: 400 },
    );
  }
  const topics = Array.isArray(body.topics) ? body.topics.filter((t) => typeof t === "string") : [];
  const ua = request.headers.get("user-agent") ?? null;

  try {
    await db
      .insert(push_subscriptions)
      .values({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: ua,
        device_id: body.device_id ?? null,
        topics,
      })
      .onConflictDoUpdate({
        target: push_subscriptions.endpoint,
        set: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: ua,
          device_id: body.device_id ?? null,
          topics,
          updated_at: sql`now()`,
          last_seen_at: sql`now()`,
        },
      });
    return NextResponse.json({ ok: true });
  } catch (err) {

    console.error("[push/subscribe] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "DB write failed." }, { status: 500 });
  }
}
