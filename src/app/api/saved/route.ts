/**
 * /api/saved (critic-1) — device-scoped saved-event registry for reminders.
 *
 *   POST   { slug, endpoint }   record that this device (push endpoint) saved an event
 *   DELETE { slug, endpoint }   remove it
 *
 * Device-keyed and UNAUTHENTICATED by design — it mirrors push_subscriptions,
 * which is device-keyed (the app has no per-user save model; saves are
 * localStorage-local). The client only calls this when the device already has a
 * push subscription, so `endpoint` is a real push-service URL; a bogus endpoint
 * is harmless because the reminder cron only sends to endpoints that JOIN a live
 * push_subscriptions row. Fail-soft: any DB issue returns a benign response so a
 * save is never blocked.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions, saved_events } from "@/lib/db/schema";
import { parseSavedRegistryInput } from "@/lib/saved-security";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const MAX_SAVED_BODY_BYTES = 4 * 1024;

async function readInput(req: NextRequest) {
  if (!isSameOriginMutationRequest(req)) {
    return { response: NextResponse.json({ error: "forbidden-origin" }, { status: 403, headers: noStore }) };
  }
  if (await isRateLimited(req, "saved-events", 120, 60 * 60)) {
    return {
      response: NextResponse.json(
        { error: "rate-limited" },
        { status: 429, headers: { ...noStore, "Retry-After": "3600" } },
      ),
    };
  }
  if (req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return { response: NextResponse.json({ error: "unsupported-media-type" }, { status: 415, headers: noStore }) };
  }
  const raw = await readJsonBodyWithLimit(req, MAX_SAVED_BODY_BYTES);
  if (!raw.ok) {
    return {
      response: NextResponse.json(
        { error: raw.error },
        { status: raw.error === "body-too-large" ? 413 : 400, headers: noStore },
      ),
    };
  }
  const input = parseSavedRegistryInput(raw.value);
  if (!input) {
    return { response: NextResponse.json({ error: "invalid-input" }, { status: 400, headers: noStore }) };
  }
  return { input };
}

async function subscriptionExists(
  db: NonNullable<ReturnType<typeof getDb>>,
  endpoint: string,
): Promise<boolean> {
  const row = await db
    .select({ endpoint: push_subscriptions.endpoint })
    .from(push_subscriptions)
    .where(eq(push_subscriptions.endpoint, endpoint))
    .limit(1);
  return row.length === 1;
}

export async function POST(req: NextRequest) {
  const parsed = await readInput(req);
  if ("response" in parsed) return parsed.response;
  const { slug, endpoint } = parsed.input;

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, db: false }, { headers: noStore });
  try {
    if (!(await subscriptionExists(db, endpoint))) {
      return NextResponse.json({ error: "subscription-not-found" }, { status: 404, headers: noStore });
    }
    await db
      .insert(saved_events)
      .values({ endpoint, event_slug: slug })
      .onConflictDoNothing({ target: [saved_events.endpoint, saved_events.event_slug] });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    // Fail-soft: the localStorage save already succeeded client-side; the
    // reminder registry is best-effort (e.g. the table isn't migrated yet).
    return NextResponse.json({ ok: false }, { headers: noStore });
  }
}

export async function DELETE(req: NextRequest) {
  const parsed = await readInput(req);
  if ("response" in parsed) return parsed.response;
  const { slug, endpoint } = parsed.input;

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, db: false }, { headers: noStore });
  try {
    if (!(await subscriptionExists(db, endpoint))) {
      return NextResponse.json({ error: "subscription-not-found" }, { status: 404, headers: noStore });
    }
    await db
      .delete(saved_events)
      .where(and(eq(saved_events.endpoint, endpoint), eq(saved_events.event_slug, slug)));
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ ok: false }, { headers: noStore });
  }
}
