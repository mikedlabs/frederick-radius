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
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";
import { sendPush, configurePush } from "@/lib/push";
import {
  PUSH_BODY_LIMITS,
  guardPushMutation,
  isJsonObject,
  isRecognizedPushEndpoint,
  pushJson,
  readPushJson,
} from "@/lib/push-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guarded = await guardPushMutation(request, "push-test", 3, 3_600);
  if (guarded) return guarded;

  const parsedBody = await readPushJson(request, PUSH_BODY_LIMITS.endpointOnly);
  if (!parsedBody.ok) return parsedBody.response;
  if (!isJsonObject(parsedBody.value) || !isRecognizedPushEndpoint(parsedBody.value.endpoint)) {
    return pushJson({ error: "Valid endpoint required." }, { status: 400 });
  }
  const endpoint = parsedBody.value.endpoint;

  if (!configurePush()) {
    return pushJson(
      { error: "VAPID keys not configured on the server." },
      { status: 503 },
    );
  }
  const db = getDb();
  if (!db) {
    return pushJson(
      { error: "Database not configured." },
      { status: 503 },
    );
  }

  try {
    const rows = await db
      .select()
      .from(push_subscriptions)
      .where(eq(push_subscriptions.endpoint, endpoint))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return pushJson({ error: "Subscription not found." }, { status: 404 });
    }
    const sent = await sendPush(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      {
        title: "Frederick Radius",
        body: "Test notification. Everything is wired up.",
        url: "/today",
        tag: "test",
      },
    );
    if (!sent) return pushJson({ error: "Send failed." }, { status: 502 });
    return pushJson({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "subscription_gone") {
      // Push service rejected the subscription — clean it up so we
      // never try this endpoint again.
      try {
        await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, endpoint));
      } catch {}
      return pushJson({ error: "Subscription expired and was removed." }, { status: 410 });
    }

    console.error("[push/test] failed:", err instanceof Error ? err.message : err);
    return pushJson({ error: "Send failed." }, { status: 500 });
  }
}
