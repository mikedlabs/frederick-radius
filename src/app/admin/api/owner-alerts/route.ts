/**
 * /admin/api/owner-alerts — grant or revoke THIS device's owner-alert push.
 *
 * Lives under /admin so the edge middleware's Basic Auth gates it (the
 * public /api/push/subscribe strips the owner topic on purpose — the alert
 * payloads can carry submitted feedback text). The browser attaches the
 * admin credentials automatically to same-origin fetches under /admin once
 * the owner has logged in, so the dashboard card can call this directly.
 *
 *   GET  ?endpoint=…        → { subscribed }      current state for a device
 *   POST { subscription, enable } → { ok, subscribed }
 *
 * POST upserts the full subscription (a device that never opted into any
 * user-facing topic still gets a row) and toggles ONLY the owner topic,
 * preserving whatever user-facing topics the device already follows.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";
import { OWNER_ALERTS_TOPIC } from "@/lib/push-topics";
import { requireJsonRequest } from "@/lib/security/admin-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "no-db" }, { status: 503, headers: noStore });
  const endpoint = req.nextUrl.searchParams.get("endpoint") ?? "";
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint-required" }, { status: 400, headers: noStore });
  }
  try {
    const rows = await db
      .select({ topics: push_subscriptions.topics })
      .from(push_subscriptions)
      .where(eq(push_subscriptions.endpoint, endpoint))
      .limit(1);
    const subscribed = Boolean(rows[0]?.topics?.includes(OWNER_ALERTS_TOPIC));
    return NextResponse.json({ subscribed }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "read-failed" }, { status: 500, headers: noStore });
  }
}

type Body = {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  enable?: boolean;
};

export async function POST(req: NextRequest) {
  const contentType = requireJsonRequest(req);
  if (contentType) return contentType;

  const db = getDb();
  if (!db) return NextResponse.json({ error: "no-db" }, { status: 503, headers: noStore });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }
  const sub = body.subscription;
  const enable = body.enable === true;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json(
      { error: "subscription must include endpoint + keys.p256dh + keys.auth" },
      { status: 400, headers: noStore },
    );
  }

  // Toggle only the owner topic; every other topic the row carries survives.
  const ownerJson = JSON.stringify([OWNER_ALERTS_TOPIC]);
  const topicsPatch = enable
    ? sql`CASE WHEN ${push_subscriptions.topics} ? ${OWNER_ALERTS_TOPIC}
        THEN ${push_subscriptions.topics}
        ELSE ${push_subscriptions.topics} || ${ownerJson}::jsonb END`
    : sql`${push_subscriptions.topics} - ${OWNER_ALERTS_TOPIC}`;

  try {
    await db
      .insert(push_subscriptions)
      .values({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: req.headers.get("user-agent"),
        topics: enable ? [OWNER_ALERTS_TOPIC] : [],
      })
      .onConflictDoUpdate({
        target: push_subscriptions.endpoint,
        set: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          topics: topicsPatch,
          updated_at: sql`now()`,
          last_seen_at: sql`now()`,
        },
      });
    return NextResponse.json({ ok: true, subscribed: enable }, { headers: noStore });
  } catch (err) {
    console.error("[owner-alerts] write failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "write-failed" }, { status: 500, headers: noStore });
  }
}
