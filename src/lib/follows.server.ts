import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { follows } from "@/lib/db/schema";
import {
  MAX_FOLLOWED_PLACES,
  normalizeFollowSlugs,
} from "@/lib/follows-contract";

export type FollowedPlaceSnapshot = {
  /** Most-recent first. */
  slugs: string[];
  /** Older rows still exist in the account but are outside the UI budget. */
  truncated: boolean;
  limit: number;
};

export type AddFollowResult = "inserted" | "existing" | "limit";

export type SyncFollowsResult = {
  inserted: number;
  acceptedSlugs: string[];
  skipped: number;
  atLimit: boolean;
  limit: number;
};

/**
 * Read the bounded account snapshot used by both the API and Saved SSR.
 * Fetching one sentinel row lets us disclose truncation without a second count
 * query. No rows are deleted; an over-limit legacy account keeps all history.
 */
export async function readFollowedPlaceSnapshot(
  db: Database,
  userId: string,
): Promise<FollowedPlaceSnapshot> {
  const rows = await db
    .select({ slug: follows.place_slug })
    .from(follows)
    .where(eq(follows.user_id, userId))
    .orderBy(
      sql`${follows.created_at} desc nulls last`,
      desc(follows.id),
    )
    .limit(MAX_FOLLOWED_PLACES + 1);

  return {
    slugs: rows.slice(0, MAX_FOLLOWED_PLACES).map((row) => row.slug),
    truncated: rows.length > MAX_FOLLOWED_PLACES,
    limit: MAX_FOLLOWED_PLACES,
  };
}

/** Backward-compatible slug-only read for narrow callers and tests. */
export async function readFollowedPlaceSlugs(
  db: Database,
  userId: string,
): Promise<string[]> {
  return (await readFollowedPlaceSnapshot(db, userId)).slugs;
}

/** Serialize concurrent writes for one account inside the current transaction. */
async function lockFollowSet(
  executor: Pick<Database, "execute">,
  userId: string,
): Promise<void> {
  await executor.execute(
    sql`select pg_advisory_xact_lock(hashtext(${userId}))`,
  );
}

/**
 * Add one place without allowing concurrent requests to cross the account cap.
 * An idempotent re-follow still succeeds when the account is already full.
 */
export async function addFollowWithinLimit(
  db: Database,
  userId: string,
  slug: string,
  source?: string,
): Promise<AddFollowResult> {
  return db.transaction(async (transaction) => {
    await lockFollowSet(transaction, userId);

    const existing = await transaction
      .select({ slug: follows.place_slug })
      .from(follows)
      .where(
        and(
          eq(follows.user_id, userId),
          eq(follows.place_slug, slug),
        ),
      )
      .limit(1);
    if (existing.length > 0) return "existing";

    const [size] = await transaction
      .select({ value: count() })
      .from(follows)
      .where(eq(follows.user_id, userId));
    if (Number(size?.value ?? 0) >= MAX_FOLLOWED_PLACES) return "limit";

    await transaction
      .insert(follows)
      .values({ user_id: userId, place_slug: slug, source })
      .onConflictDoNothing({
        target: [follows.user_id, follows.place_slug],
      });
    return "inserted";
  });
}

/**
 * Import a recent-first local list into the remaining account capacity. Existing
 * rows do not consume incoming capacity, and an over-limit legacy account is
 * left intact rather than silently deleting older saves.
 */
export async function syncFollowsWithinLimit(
  db: Database,
  userId: string,
  recentFirstSlugs: readonly unknown[],
): Promise<SyncFollowsResult> {
  const requested = normalizeFollowSlugs(recentFirstSlugs);
  if (requested.length === 0) {
    return {
      inserted: 0,
      acceptedSlugs: [],
      skipped: 0,
      atLimit: false,
      limit: MAX_FOLLOWED_PLACES,
    };
  }

  return db.transaction(async (transaction) => {
    await lockFollowSet(transaction, userId);

    const [size] = await transaction
      .select({ value: count() })
      .from(follows)
      .where(eq(follows.user_id, userId));
    const currentCount = Number(size?.value ?? 0);

    const existingRows = await transaction
      .select({ slug: follows.place_slug })
      .from(follows)
      .where(
        and(
          eq(follows.user_id, userId),
          inArray(follows.place_slug, requested),
        ),
      );
    const existing = new Set(existingRows.map((row) => row.slug));
    const missing = requested.filter((slug) => !existing.has(slug));
    const available = Math.max(0, MAX_FOLLOWED_PLACES - currentCount);
    const toInsert = missing.slice(0, available);

    if (toInsert.length > 0) {
      await transaction
        .insert(follows)
        .values(
          toInsert.map((slug) => ({
            user_id: userId,
            place_slug: slug,
            source: "synced" as const,
          })),
        )
        .onConflictDoNothing({
          target: [follows.user_id, follows.place_slug],
        });
    }

    return {
      inserted: toInsert.length,
      acceptedSlugs: toInsert,
      skipped: missing.length - toInsert.length,
      atLimit:
        currentCount >= MAX_FOLLOWED_PLACES
        || currentCount + toInsert.length >= MAX_FOLLOWED_PLACES,
      limit: MAX_FOLLOWED_PLACES,
    };
  });
}
