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
import { isOwnerTopic, OWNER_ALERTS_TOPIC } from "@/lib/push-topics";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export const runtime = "nodejs";

type Body = {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  topics?: string[];
  device_id?: string;
  /** The user's home municipality slug, so town-scoped sends can reach them.
   *  Validated against the known municipalities; anything else is ignored. */
  home_town?: string;
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
  // The settings card only ever manages the fixed user-facing topics, so it
  // POSTs just those. Two kinds of topic must NOT be wiped by that wholesale
  // replace on re-subscribe:
  //   - biz:<slug> place follows (SaveButton/Follow) — the card never sends
  //     them, so a naive replace silently unfollowed every business a user
  //     had followed the moment they touched any toggle (data-loss bug).
  //   - owner-alerts — carries feedback text + signup emails; this open
  //     endpoint can neither grant it (stripped from input here) nor revoke
  //     it. Only /admin/api/owner-alerts, behind Basic Auth, toggles it.
  // Both are preserved from the EXISTING row in the ON CONFLICT update below.
  const topics = Array.isArray(body.topics)
    ? body.topics.filter((t) => typeof t === "string" && !isOwnerTopic(t) && !t.startsWith("biz:"))
    : [];
  const ua = request.headers.get("user-agent") ?? null;
  // Home town for town-scoped sends. Only a real municipality slug is stored;
  // null when unknown. On update we COALESCE so a topics-only re-subscribe (a
  // toggle, a Follow) never wipes a previously-captured town.
  const homeTown =
    typeof body.home_town === "string" && MUNICIPALITY_BY_SLUG[body.home_town] ? body.home_town : null;

  try {
    const topicsJson = JSON.stringify(topics);
    await db
      .insert(push_subscriptions)
      .values({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: ua,
        device_id: body.device_id ?? null,
        topics,
        home_town: homeTown,
      })
      .onConflictDoUpdate({
        target: push_subscriptions.endpoint,
        set: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: ua,
          device_id: body.device_id ?? null,
          home_town: sql`COALESCE(${homeTown}, ${push_subscriptions.home_town})`,
          // New fixed topics from the card, UNION every topic on the existing
          // row that the card doesn't manage (biz:<slug> follows + owner-alerts).
          // The two sets are disjoint (input strips biz:/owner above), so the
          // jsonb `||` concat can't duplicate.
          topics: sql`${topicsJson}::jsonb || COALESCE(
            (SELECT jsonb_agg(elem)
               FROM jsonb_array_elements_text(${push_subscriptions.topics}) AS elem
              WHERE elem LIKE 'biz:%' OR elem = ${OWNER_ALERTS_TOPIC}),
            '[]'::jsonb)`,
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
