import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { user_profiles } from "@/lib/db/schema";
import { getServerUserId } from "@/lib/auth";
import {
  MAX_FOLLOWED_PLACES,
  normalizeFollowSlugs,
} from "@/lib/follows-contract";
import { syncFollowsWithinLimit } from "@/lib/follows.server";
import {
  hasJsonContentType,
  isSameOriginMutationRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

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
  if (!isSameOriginMutationRequest(req)) {
    return NextResponse.json({ error: "forbidden-origin" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "content-type" }, { status: 415 });
  }
  const parsedBody = await readJsonBodyWithLimit(req, 64 * 1_024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.error === "body-too-large" ? 413 : 400 },
    );
  }
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database-unavailable" }, { status: 503 });
  }

  const body = parsedBody.value && typeof parsedBody.value === "object"
    ? parsedBody.value as { slugs?: unknown }
    : {};
  if (!Array.isArray(body.slugs)) {
    return NextResponse.json({ error: "slugs-must-be-array" }, { status: 400 });
  }
  // The browser sends most-recent first so a legacy device list larger than
  // the account budget keeps the saves that are most likely to matter now.
  const slugs = normalizeFollowSlugs(body.slugs as unknown[]);

  if (slugs.length === 0) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      acceptedSlugs: [],
      skipped: 0,
      atLimit: false,
      limit: MAX_FOLLOWED_PLACES,
    });
  }

  // Ensure profile exists before inserting follows.
  await db
    .insert(user_profiles)
    .values({ id: userId })
    .onConflictDoNothing({ target: user_profiles.id });

  const result = await syncFollowsWithinLimit(db, userId, slugs);
  return NextResponse.json({ ok: true, ...result });
}
