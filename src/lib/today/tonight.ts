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
import { pickLeadEvent } from "@/lib/events/lead-rank";
import { isEventToday, isEventEnded } from "@/lib/eventWhenLabel";

// Event titles that look like internal/admin business — board meetings,
// hearings, classes, rehearsals. Public meetings live on /events under their
// own section; they never carry a "tonight" hero.
export const NON_PUBLIC_EVENT =
  /\b(board|council|commission|hearing|workshop|rehearsal|board meeting|training|orientation|class|certification|breastfeeding|prenatal|birthing|info session|hr|policy)\b/i;

export function pickTonightEvent(now: Date, pool: EventWithMeta[]): EventWithMeta | null {
  const tonight = pool.filter(
    (e) =>
      isEventToday(e.starts_at, now) &&
      !isEventEnded(e, now) &&
      !NON_PUBLIC_EVENT.test(e.title ?? ""),
  );
  // Lead-rank, not raw chronology: a photo-led draw, then any real draw, then a
  // routine recurring program (storytime/class) last — so the cron-ingested
  // library calendar can't put a storytime in the hero ahead of tonight's
  // carnival or concert.
  return pickLeadEvent(tonight);
}
