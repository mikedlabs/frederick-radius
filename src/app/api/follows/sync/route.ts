import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { follows, user_profiles } from "@/lib/db/schema";
import { getServerUserId } from "@/lib/auth";

/**
 * /api/follows/sync — one-shot bulk import of localStorage follows.
 *
 * When a user signs in for the first time after building a list in
 * the logged-out localStorage flow, useFollows POSTs their existing
 * slugs here. We INSERT ... ON CONFLICT DO NOTHING so re-running the
 * sync is safe (and required, since the client can't always tell
 * which slugs are already in the DB without an extra round-trip).
 *
 * Source is hard-coded to "synced" so analytics can distinguish
 * pre-signin localStorage follows from explicit post-signin ones.
 */
export async function POST(req: NextRequest) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503 });
  }

  let body: { slugs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  if (!Array.isArray(body.slugs)) {
    return NextResponse.json({ error: "slugs-must-be-array" }, { status: 400 });
  }
  const slugs = (body.slugs as unknown[])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 120);

  if (slugs.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  // Cap sync at 500 to avoid pathological imports — far more than
  // any real user's localStorage list and a sensible safety belt.
  const capped = slugs.slice(0, 500);

  // Ensure profile exists before inserting follows.
  await db
    .insert(user_profiles)
    .values({ id: userId })
    .onConflictDoNothing({ target: user_profiles.id });

  await db
    .insert(follows)
    .values(
      capped.map((slug) => ({
        user_id: userId,
        place_slug: slug,
        source: "synced" as const,
      })),
    )
    .onConflictDoNothing({ target: [follows.user_id, follows.place_slug] });

  return NextResponse.json({ ok: true, inserted: capped.length });
}
