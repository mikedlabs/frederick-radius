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
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { push_subscriptions } from "@/lib/db/schema";

export const runtime = "nodejs";

type Body = {
  endpoint?: string;
  add?: string[];
  remove?: string[];
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

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
  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }
  const toAdd = asStringArray(body.add);
  const toRemove = asStringArray(body.remove);
  if (toAdd.length === 0 && toRemove.length === 0) {
    return NextResponse.json({ error: "add or remove must be a non-empty array" }, { status: 400 });
  }

  try {
    const rows = await db
      .select({ topics: push_subscriptions.topics })
      .from(push_subscriptions)
      .where(eq(push_subscriptions.endpoint, body.endpoint))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ error: "subscription not found" }, { status: 404 });
    }
    const current = new Set(rows[0].topics ?? []);
    for (const t of toAdd) current.add(t);
    for (const t of toRemove) current.delete(t);
    const next = [...current];

    await db
      .update(push_subscriptions)
      .set({ topics: next, updated_at: sql`now()`, last_seen_at: sql`now()` })
      .where(eq(push_subscriptions.endpoint, body.endpoint));

    return NextResponse.json({ ok: true, topics: next });
  } catch (err) {
    console.error("[push/topics] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "DB write failed." }, { status: 500 });
  }
}
