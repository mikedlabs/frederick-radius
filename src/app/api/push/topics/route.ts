/**
 * Merge-style topic updates for an existing push subscription.
 *
 * The `/api/push/subscribe` endpoint REPLACES the topic list — fine
 * for the settings card (it owns the full picture), but the wrong
 * semantics for per-place "Follow" toggles, which only want to add
 * or remove a single `biz:<slug>` topic.
 *
 * Body shape:
 *   {
 *     endpoint: string,           // identifies the subscription row
 *     add?: string[],             // topics to add to the set
 *     remove?: string[]           // topics to remove from the set
 *   }
 *
 * The operation is set-style: adding a topic that's already present
 * is a no-op, removing one that isn't present is a no-op. Returns
 * the resulting topics list so the client can confirm state.
 *
 * Drops to 503 when push isn't configured for this deployment.
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";
import {
  applyPublicTopicChanges,
  parsePublicTopicChanges,
  publicPushTopics,
} from "@/lib/push-topics";
import {
  PUSH_BODY_LIMITS,
  guardPushMutation,
  guardPushRead,
  isJsonObject,
  isRecognizedPushEndpoint,
  pushJson,
  readPushJson,
} from "@/lib/push-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/topics?endpoint=... — read back the topics a subscription is
 * currently opted into, so the settings card can hydrate its toggles on mount
 * instead of showing everything OFF for a returning subscriber (which, on the
 * next toggle, would REPLACE the server set with the empty-seeded UI and wipe
 * their real selections). Returns [] when push isn't configured or the
 * subscription isn't found.
 */
export async function GET(request: Request) {
  const guarded = await guardPushRead(request, "push-topics-read", 60, 60);
  if (guarded) return guarded;

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!isRecognizedPushEndpoint(endpoint)) {
    return pushJson({ error: "Valid endpoint required." }, { status: 400 });
  }

  const db = getDb();
  if (!db) return pushJson({ topics: [] });
  try {
    const rows = await db
      .select({ topics: push_subscriptions.topics })
      .from(push_subscriptions)
      .where(eq(push_subscriptions.endpoint, endpoint))
      .limit(1);
    return pushJson({ topics: publicPushTopics(rows[0]?.topics ?? []) });
  } catch (err) {
    console.error("[push/topics GET] failed:", err instanceof Error ? err.message : err);
    return pushJson({ topics: [] });
  }
}

export async function POST(request: Request) {
  const guarded = await guardPushMutation(request, "push-topics-write", 60, 60);
  if (guarded) return guarded;

  const parsedBody = await readPushJson(request, PUSH_BODY_LIMITS.topics);
  if (!parsedBody.ok) return parsedBody.response;
  if (!isJsonObject(parsedBody.value)) {
    return pushJson({ error: "Invalid request body." }, { status: 400 });
  }
  const body = parsedBody.value;
  if (!isRecognizedPushEndpoint(body.endpoint)) {
    return pushJson({ error: "Valid endpoint required." }, { status: 400 });
  }
  const endpoint = body.endpoint;

  const changes = parsePublicTopicChanges(body.add, body.remove);
  if (!changes) {
    return pushJson({ error: "Invalid topic change." }, { status: 400 });
  }
  if (changes.add.length === 0 && changes.remove.length === 0) {
    return pushJson({ error: "Add or remove a topic." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return pushJson(
      { error: "Push not configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const rows = await db
      .select({ topics: push_subscriptions.topics })
      .from(push_subscriptions)
      .where(eq(push_subscriptions.endpoint, endpoint))
      .limit(1);
    if (rows.length === 0) {
      return pushJson({ error: "Subscription not found." }, { status: 404 });
    }
    const next = applyPublicTopicChanges(rows[0].topics ?? [], changes);

    const updated = await db
      .update(push_subscriptions)
      .set({ topics: next, updated_at: sql`now()`, last_seen_at: sql`now()` })
      .where(eq(push_subscriptions.endpoint, endpoint))
      .returning({ id: push_subscriptions.id });
    if (updated.length === 0) {
      return pushJson({ error: "Subscription not found." }, { status: 404 });
    }

    return pushJson({ ok: true, topics: publicPushTopics(next) });
  } catch (err) {
    console.error("[push/topics] failed:", err instanceof Error ? err.message : err);
    return pushJson({ error: "DB write failed." }, { status: 500 });
  }
}
