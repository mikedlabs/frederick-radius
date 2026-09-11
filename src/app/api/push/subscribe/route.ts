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
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";
import {
  OWNER_ALERTS_TOPIC,
  parsePublicFixedPushTopics,
} from "@/lib/push-topics";
import { isMunicipalitySlug } from "@/data/municipalities";
import {
  PUSH_BODY_LIMITS,
  guardPushMutation,
  isJsonObject,
  isValidDeviceId,
  parsePushSubscription,
  pushJson,
  readPushJson,
} from "@/lib/push-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guarded = await guardPushMutation(request, "push-subscribe", 30, 600);
  if (guarded) return guarded;

  const parsedBody = await readPushJson(request, PUSH_BODY_LIMITS.subscribe);
  if (!parsedBody.ok) return parsedBody.response;
  if (!isJsonObject(parsedBody.value)) {
    return pushJson({ error: "Invalid request body." }, { status: 400 });
  }

  const body = parsedBody.value;
  const sub = parsePushSubscription(body.subscription);
  if (!sub) {
    return pushJson(
      { error: "A valid browser PushSubscription is required." },
      { status: 400 },
    );
  }

  const topics = parsePublicFixedPushTopics(body.topics);
  if (!topics) {
    return pushJson({ error: "Invalid notification topics." }, { status: 400 });
  }

  if (
    body.device_id !== undefined &&
    body.device_id !== null &&
    !isValidDeviceId(body.device_id)
  ) {
    return pushJson({ error: "Invalid device id." }, { status: 400 });
  }

  if (
    body.home_town !== undefined &&
    body.home_town !== null &&
    !isMunicipalitySlug(body.home_town)
  ) {
    return pushJson({ error: "Invalid home town." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return pushJson(
      { error: "Push not configured on this deployment." },
      { status: 503 },
    );
  }
  // The settings card only ever manages the fixed user-facing topics, so it
  // POSTs just those. Two kinds of topic must NOT be wiped by that wholesale
  // replace on re-subscribe:
  //   - biz:<slug> place follows (SaveButton/Follow) — the card never sends
  //     them, so a naive replace silently unfollowed every business a user
  //     had followed the moment they touched any toggle (data-loss bug).
  //   - owner-alerts — carries private operational alerts; this open
  //     endpoint can neither grant it (stripped from input here) nor revoke
  //     it. Only /admin/api/owner-alerts, behind Basic Auth, toggles it.
  // Both are preserved from the EXISTING row in the ON CONFLICT update below.
  const ua = request.headers.get("user-agent")?.slice(0, 512) ?? null;
  // Home town for town-scoped sends. Only a real municipality slug is stored;
  // null when unknown. On update we COALESCE so a topics-only re-subscribe (a
  // toggle, a Follow) never wipes a previously-captured town.
  const homeTown =
    typeof body.home_town === "string" ? body.home_town : null;

  try {
    const topicsJson = JSON.stringify(topics);
    const written = await db
      .insert(push_subscriptions)
      .values({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: ua,
        device_id: typeof body.device_id === "string" ? body.device_id : null,
        topics,
        home_town: homeTown,
      })
      .onConflictDoUpdate({
        target: push_subscriptions.endpoint,
        set: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: ua,
          device_id: typeof body.device_id === "string" ? body.device_id : null,
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
        // The endpoint is a public-row natural key. Treat the encryption keys
        // as proof of the existing browser subscription and never let a caller
        // that knows only the endpoint replace them. Keeping this predicate in
        // the ON CONFLICT statement also closes the first-insert race.
        setWhere: sql`${push_subscriptions.p256dh} = ${sub.keys.p256dh}
          AND ${push_subscriptions.auth} = ${sub.keys.auth}`,
      })
      .returning({ id: push_subscriptions.id });

    if (written.length === 0) {
      return pushJson({ error: "Subscription ownership check failed." }, { status: 409 });
    }
    return pushJson({ ok: true });
  } catch (err) {
    console.error("[push/subscribe] failed:", err instanceof Error ? err.message : err);
    return pushJson({ error: "DB write failed." }, { status: 500 });
  }
}
