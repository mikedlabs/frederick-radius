/**
 * eventSaves — quiet social proof from data the app already collects.
 *
 * Every event save mirrors into the saved_events reminder registry
 * (device-keyed), but the aggregate was never read (data audit: "collected
 * but never surfaced"). This exposes ONE number per slug — how many devices
 * saved this event — for the detail page's "N people have this saved" line.
 *
 * Honesty rules: rendered only at 3+ (a count of 1 is the reader themselves;
 * 2 reads as surveillance), device-counted not people-counted (we say
 * "saves", never "people"), and fail-soft to 0 on any DB trouble. Cached
 * 15 min — social proof doesn't need to be to-the-second.
 */
import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { saved_events } from "@/lib/db/schema";

const MIN_VISIBLE = 3;

async function countSaves(slug: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  try {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(saved_events)
      .where(sql`${saved_events.event_slug} = ${slug}`);
    return rows[0]?.n ?? 0;
  } catch {
    return 0; // table missing / DB down — no social proof beats a 500
  }
}

const cachedCount = unstable_cache(
  (slug: string) => countSaves(slug),
  ["event-save-count-v1"],
  { revalidate: 900 },
);

/** Save count for an event, or null when below the honesty floor. */
export async function eventSaveCount(slug: string): Promise<number | null> {
  const n = await cachedCount(slug);
  return n >= MIN_VISIBLE ? n : null;
}
