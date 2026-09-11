/**
 * Remove a Web Push subscription by endpoint. Idempotent — calling
 * with a stale endpoint returns 200 and a count of 0.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";
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
  const guarded = await guardPushMutation(request, "push-unsubscribe", 10, 600);
  if (guarded) return guarded;

  const parsedBody = await readPushJson(request, PUSH_BODY_LIMITS.endpointOnly);
  if (!parsedBody.ok) return parsedBody.response;
  if (!isJsonObject(parsedBody.value) || !isRecognizedPushEndpoint(parsedBody.value.endpoint)) {
    return pushJson({ error: "Valid endpoint required." }, { status: 400 });
  }
  const endpoint = parsedBody.value.endpoint;

  const db = getDb();
  if (!db) {
    return pushJson(
      { error: "Push not configured on this deployment." },
      { status: 503 },
    );
  }
  try {
    const deleted = await db
      .delete(push_subscriptions)
      .where(eq(push_subscriptions.endpoint, endpoint))
      .returning({ id: push_subscriptions.id });
    return pushJson({ ok: true, removed: deleted.length });
  } catch (err) {
    console.error("[push/unsubscribe] failed:", err instanceof Error ? err.message : err);
    return pushJson({ error: "DB delete failed." }, { status: 500 });
  }
}
