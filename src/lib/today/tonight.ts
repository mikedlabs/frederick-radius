/**
 * pickTonightEvent — tonight's marquee event: the best still-catchable DRAW
 * happening TODAY (Eastern).
 *
 * Lifted out of the /today page so more than one surface can speak the same
 * "tonight" answer without re-deriving it (the SkyHero teaser, the What's-On
 * feature, and the composed "right now" line all agree on ONE headliner).
 *
 * History (kept from the page): this picker used to lead-rank a 72-hour pool and
 * its callers then nulled the result unless the winner started today — so a
 * photo-backed Thursday event could blank the masthead on a night with a live
 * game downtown. It now filters FIRST (today's Eastern day, not yet ended,
 * non-administrative) and lead-ranks inside that pool, so the hero is alive on
 * exactly the nights it matters and can never carry an event the user missed.
 * If nothing qualifies, it returns null: honest beats padded.
 */
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventLeadTier, eventProminence, pickLeadEvent } from "@/lib/events/lead-rank";
import { isEventToday, isEventEnded, isEventLiveNow } from "@/lib/eventWhenLabel";

// Event titles that look like internal/admin business — board meetings,
// hearings, classes, rehearsals. Public meetings live on /events under their
// own section; they never carry a "tonight" hero.
export const NON_PUBLIC_EVENT =
  /\b(board|council|commission|hearing|workshop|rehearsal|board meeting|training|orientation|class|certification|breastfeeding|prenatal|birthing|info session|hr|policy)\b/i;

/** Feed-safe identity for the same occurrence when providers mint different
 * slugs but agree on title and roughly the same start time. */
export function isSameTodayListing(
  a: Pick<EventWithMeta, "slug" | "title" | "starts_at">,
  b: Pick<EventWithMeta, "slug" | "title" | "starts_at">,
): boolean {
  if (a.slug === b.slug) return true;
  const titleKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return titleKey(a.title) === titleKey(b.title)
    && Math.abs(Date.parse(a.starts_at) - Date.parse(b.starts_at)) <= 60 * 60 * 1000;
}

export function pickTonightEvent(now: Date, pool: EventWithMeta[]): EventWithMeta | null {
  const tonight = pool.filter(
    (e) =>
      isEventToday(e.starts_at, now) &&
      !isEventEnded(e, now) &&
      !NON_PUBLIC_EVENT.test(e.title ?? ""),
  );
  const bestOverall = pickLeadEvent(tonight);

  // "Right now" breaks a close contest; it does not make every small live
  // listing the day's headline. A live club walk previously displaced Alive
  // @ Five for the whole afternoon because this branch ignored prominence
  // entirely. Let a live draw lead when it is within one prominence point of
  // the best event still catchable today. A clearly larger verified draw keeps
  // the headline until it begins.
  const liveDraws = tonight.filter(
    (e) => isEventLiveNow(e, now) && eventLeadTier(e) === 0,
  );
  if (liveDraws.length > 0) {
    const bestLive = pickLeadEvent(liveDraws);
    if (
      bestLive &&
      (!bestOverall || eventProminence(bestLive) >= eventProminence(bestOverall) - 1)
    ) {
      return bestLive;
    }
  }

  // Lead-rank, not raw chronology: a photo-led draw, then any real draw, then a
  // routine recurring program (storytime/class) last — so the cron-ingested
  // library calendar can't put a storytime in the hero ahead of tonight's
  // carnival or concert.
  return bestOverall;
}

/**
 * Select the Today lead and remove every duplicate of that occurrence from the
 * remaining rows. This keeps one event visible exactly once when two feeds use
 * different slugs for the same listing.
 */
export function splitTonightFeature(
  now: Date,
  pool: EventWithMeta[],
): { feature: EventWithMeta | null; remaining: EventWithMeta[] } {
  const feature = pickTonightEvent(now, pool);
  if (!feature) return { feature: null, remaining: pool };
  return {
    feature,
    remaining: withoutTodayFeature(feature, pool),
  };
}

/** Remove the selected occurrence from any other Today bucket. */
export function withoutTodayFeature(
  feature: EventWithMeta | null,
  pool: EventWithMeta[],
): EventWithMeta[] {
  if (!feature) return pool;
  return pool.filter((event) => !isSameTodayListing(event, feature));
}
