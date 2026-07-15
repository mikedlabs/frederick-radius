/**
 * GET/POST /api/push/prefs — a device's notification preferences that aren't
 * topics: the Eastern-time quiet-hours window (and, optionally, home town).
 * Keyed by the subscription endpoint, like the rest of the push API. Topics
 * still flow through /api/push/subscribe; this is only the extra prefs so
 * toggling quiet hours never has to touch the topic set.
 */
import { sql, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
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

const EMPTY = { quiet_start: null, quiet_end: null, home_town: null };

/** An Eastern hour 0-23, or null to clear. */
function isQuietHour(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23);
}

export async function GET(request: Request) {
  const guarded = await guardPushRead(request, "push-prefs-read", 60, 60);
  if (guarded) return guarded;

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!isRecognizedPushEndpoint(endpoint)) {
    return pushJson({ error: "Valid endpoint required." }, { status: 400 });
  }

  const db = getDb();
  if (!db) return pushJson(EMPTY);
  try {
    const rows = await db
      .select({
        quiet_start: push_subscriptions.quiet_start,
        quiet_end: push_subscriptions.quiet_end,
        home_town: push_subscriptions.home_town,
      })
      .from(push_subscriptions)
      .where(eq(push_subscriptions.endpoint, endpoint))
      .limit(1);
    return pushJson(rows[0] ?? EMPTY);
  } catch {
    return pushJson(EMPTY);
  }
}

export async function POST(request: Request) {
  const guarded = await guardPushMutation(request, "push-prefs-write", 30, 60);
  if (guarded) return guarded;

  const parsedBody = await readPushJson(request, PUSH_BODY_LIMITS.prefs);
  if (!parsedBody.ok) return parsedBody.response;
  if (!isJsonObject(parsedBody.value)) {
    return pushJson({ error: "Invalid request body." }, { status: 400 });
  }
  const body = parsedBody.value;
  if (!isRecognizedPushEndpoint(body.endpoint)) {
    return pushJson({ error: "Valid endpoint required." }, { status: 400 });
  }
  const endpoint = body.endpoint;

  if (!("quiet_start" in body) || !("quiet_end" in body)) {
    return pushJson({ error: "quiet_start and quiet_end are required." }, { status: 400 });
  }
  if (!isQuietHour(body.quiet_start) || !isQuietHour(body.quiet_end)) {
    return pushJson({ error: "Quiet hours must be null or an integer from 0 to 23." }, { status: 400 });
  }
  const quiet_start = body.quiet_start;
  const quiet_end = body.quiet_end;

  const homeProvided = "home_town" in body;
  if (
    homeProvided &&
    body.home_town !== null &&
    (typeof body.home_town !== "string" || !MUNICIPALITY_BY_SLUG[body.home_town])
  ) {
    return pushJson({ error: "Invalid home town." }, { status: 400 });
  }
  const home_town = typeof body.home_town === "string" ? body.home_town : null;

  const db = getDb();
  if (!db) return pushJson({ error: "Push not configured." }, { status: 503 });

  try {
    let updated: Array<{ id: string }>;
    if (homeProvided) {
      updated = await db
        .update(push_subscriptions)
        .set({ quiet_start, quiet_end, home_town, updated_at: sql`now()` })
        .where(eq(push_subscriptions.endpoint, endpoint))
        .returning({ id: push_subscriptions.id });
    } else {
      updated = await db
        .update(push_subscriptions)
        .set({ quiet_start, quiet_end, updated_at: sql`now()` })
        .where(eq(push_subscriptions.endpoint, endpoint))
        .returning({ id: push_subscriptions.id });
    }
    if (updated.length === 0) {
      return pushJson({ error: "Subscription not found." }, { status: 404 });
    }
    return pushJson({ ok: true });
  } catch {
    return pushJson({ error: "DB write failed." }, { status: 500 });
  }
}
