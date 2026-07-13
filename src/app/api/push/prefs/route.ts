/**
 * GET/POST /api/push/prefs — a device's notification preferences that aren't
 * topics: the Eastern-time quiet-hours window (and, optionally, home town).
 * Keyed by the subscription endpoint, like the rest of the push API. Topics
 * still flow through /api/push/subscribe; this is only the extra prefs so
 * toggling quiet hours never has to touch the topic set.
 */
import { NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

export const runtime = "nodejs";

const EMPTY = { quiet_start: null, quiet_end: null, home_town: null };

/** An Eastern hour 0-23, or null to clear. Anything else -> null. */
function clampHour(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

export async function GET(request: Request) {
  const db = getDb();
  if (!db) return NextResponse.json(EMPTY);
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
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
    return NextResponse.json(rows[0] ?? EMPTY);
  } catch {
    return NextResponse.json(EMPTY);
  }
}

export async function POST(request: Request) {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Push not configured." }, { status: 503 });
  let body: { endpoint?: string; quiet_start?: number | null; quiet_end?: number | null; home_town?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

  const quiet_start = clampHour(body.quiet_start);
  const quiet_end = clampHour(body.quiet_end);
  // home_town: a valid slug sets it, explicit null clears it, absent leaves it.
  const homeProvided = "home_town" in body;
  const home_town =
    typeof body.home_town === "string" && MUNICIPALITY_BY_SLUG[body.home_town] ? body.home_town : null;

  try {
    if (homeProvided) {
      await db
        .update(push_subscriptions)
        .set({ quiet_start, quiet_end, home_town, updated_at: sql`now()` })
        .where(eq(push_subscriptions.endpoint, body.endpoint));
    } else {
      await db
        .update(push_subscriptions)
        .set({ quiet_start, quiet_end, updated_at: sql`now()` })
        .where(eq(push_subscriptions.endpoint, body.endpoint));
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "DB write failed." }, { status: 500 });
  }
}
