/**
 * Lead ranking — which event leads "what's worth your time" and the order the
 * /today rail reads in. Plain chronology made a 10am library storytime outrank
 * a fire-company carnival tonight, especially after the cron-ingested library
 * calendar was folded into the unified set (PR #894). This floats real DRAWS
 * above ROUTINE recurring programs, without a value judgment beyond "this is a
 * standing program, not a one-off draw."
 *
 * Tiers (lower = leads):
 *   0  draw            — a carnival, concert, market, festival, one-off
 *   1  routine program — storytime, weekly class, club, guild, support group
 *   2  utility         — civic/meeting business (already tucked elsewhere)
 * Within a tier: an event with imagery first, then soonest. (hero_image can't
 * be the top tier — withVenueThumbs decorates nearly every event with a venue
 * thumbnail, so it no longer distinguishes a real draw from a storytime.)
 */
import { isUtilityEvent } from "@/lib/event-kind";

/** The structural subset the ranker actually reads — EventWithMeta satisfies
 *  it, and so do lighter shapes (e.g. the On-now strip's OnNowEvent), so the
 *  same tiers rank every surface without coupling them to the loader type. */
export type LeadRankable = {
  title?: string;
  category?: string;
  hero_image?: string | null;
  starts_at: string;
};

// Standing programs that recur on a calendar and aren't a "come out tonight"
// draw. Tight, specific phrases so a real draw (carnival, concert, festival,
// bingo night, fish fry) is never demoted. Title-only, like classifyEvent.
const ROUTINE_PROGRAM =
  /\b(story\s?times?|lap\s?sit|toddler time|baby (time|lap)|preschool (story|play)|tutor(ing)?|study (hall|group)|homework help|knit(ting)?|crochet|cross\s?stitch|quilt(ing)?|craft (time|club|circle)|coloring|chess club|game (club|night at the library)|book club|reading group|writers? (group|club)|\bguild\b|water\s?color|yoga|tai chi|zumba|pilates|meditation|mindfulness|support group|grief group|english conversation|\besl\b|citizenship class|computer (class|basics|help)|tech (help|tutor)|résumé|resume help|job (club|help|seekers)|genealogy|drop[- ]?in (craft|play|tech|help)|conversation class(es)?|school skills|build and play|family support specialist|\bdcfs\b)\b/i;

export function isRoutineProgram(e: { title?: string }): boolean {
  return ROUTINE_PROGRAM.test(e.title ?? "");
}

/** Lead tier — see module doc. Lower leads. */
export function eventLeadTier(e: LeadRankable): number {
  if (isUtilityEvent(e)) return 2;
  if (isRoutineProgram(e)) return 1;
  return 0;
}

/** Comparator: lead tier, then has-imagery, then soonest. Stable, pure. */
export function compareForLead(a: LeadRankable, b: LeadRankable): number {
  const ta = eventLeadTier(a);
  const tb = eventLeadTier(b);
  if (ta !== tb) return ta - tb;
  const ia = a.hero_image ? 0 : 1;
  const ib = b.hero_image ? 0 : 1;
  if (ia !== ib) return ia - ib;
  return Date.parse(a.starts_at) - Date.parse(b.starts_at);
}

/** Best single lead from a pool (e.g. the /today hero). Returns null if empty.
 *  An owner-featured slug (src/data/featured-events.json, resolved by the
 *  caller via featuredEventSlugs so this module stays clock-free) beats the
 *  heuristic; ties among featured events fall back to the same comparator. */
export function pickLeadEvent<T extends LeadRankable & { slug?: string }>(
  pool: T[],
  featured?: ReadonlySet<string>,
): T | null {
  if (pool.length === 0) return null;
  if (featured && featured.size > 0) {
    const editorial = pool
      .filter((e) => e.slug && featured.has(e.slug))
      .sort(compareForLead)[0];
    if (editorial) return editorial;
  }
  return [...pool].sort(compareForLead)[0];
}
