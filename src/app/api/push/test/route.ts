/**
 * Send a test notification to a single subscription endpoint. Lets a
 * user verify end-to-end delivery from the /settings/notifications
 * page without any cron involvement.
 *
 *   POST { "endpoint": "..." }
 *   → 200 { ok: true }
 *   → 503 when push is unconfigured (no VAPID env)
 *   → 404 when the endpoint isn't in the DB
 *   → 410 when the push service rejected the subscription (expired)
 *
 * Safe to expose publicly because:
 *  - It only fires to the EXACT endpoint the caller already owns (the
 *    push service won't deliver to a stranger).
 *  - It's rate-limited by the client UX (a button push).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";
import { sendPush, configurePush } from "@/lib/push";

export const runtime = "nodejs";

type Body = { endpoint?: string };

export async function POST(request: Request) {
  if (!configurePush()) {
    return NextResponse.json(
      { error: "VAPID keys not configured on the server." },
      { status: 503 },
    );
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database not configured." },
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
    const rows = await db
      .select()
      .from(push_subscriptions)
      .where(eq(push_subscriptions.endpoint, body.endpoint))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "subscription not found" }, { status: 404 });
    }
    await sendPush(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      {
        title: "Frederick Radius",
        body: "Test notification. Everything is wired up.",
        url: "/now",
        tag: "test",
      },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "subscription_gone") {
      // Push service rejected the subscription — clean it up so we
      // never try this endpoint again.
      try {
        await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, body.endpoint));
      } catch {}
      return NextResponse.json({ error: "subscription expired, removed" }, { status: 410 });
    }

    console.error("[push/test] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "send failed" }, { status: 500 });
  }
}
