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
import { getSql } from "@/lib/db/client";
import { withDeadlineOutcome } from "@/lib/promise-deadline";

const MIN_VISIBLE = 3;
export const EVENT_SAVE_COUNT_TIMEOUT_MS = 400;

type SaveCountRow = {
  n: number | string | null;
};

type CancellablePromiseLike<T> = PromiseLike<T> & {
  cancel?: () => void;
};

async function countSaves(slug: string): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;

  const query = sql<SaveCountRow[]>`
    select count(*)::int as n
    from public.saved_events
    where event_slug = ${slug}
  ` as CancellablePromiseLike<SaveCountRow[]>;
  const outcome = await withDeadlineOutcome(
    Promise.resolve(query),
    EVENT_SAVE_COUNT_TIMEOUT_MS,
  );
  if (outcome.status !== "fulfilled") {
    if (outcome.status === "timed_out") {
      try {
        query.cancel?.();
      } catch {
        // Cancellation is best-effort; the deadline helper already consumes
        // a late rejection so an optional count cannot poison the page.
      }
    }
    // Structured and payload-free: production logs can distinguish a slow
    // optional read from an event-resolution failure without recording a
    // visitor identifier, event title, database URL, or raw exception.
    console.warn(JSON.stringify({
      level: "warn",
      message: "Event detail save-count read did not complete.",
      phase: "event-detail-secondary",
      operation: "save-count",
      outcome: outcome.status,
    }));
    return 0;
  }

  const count = Number(outcome.value[0]?.n ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
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
