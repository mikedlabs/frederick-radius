/**
 * Golden-hour pairing — the signature field-guide beat: when evening golden
 * hour is ACTIVE and there's a genuinely OUTDOOR draw on in that light, pair the
 * two ("Golden hour now · best light until 8:39 · on now: Firemen's Carnival").
 * Both halves are grounded facts — real NOAA sun math (lib/sun) + a real event
 * that is actually on during the window. Together they support a useful,
 * explainable recommendation without inventing certainty.
 *
 * Honesty rules learned from adversarial review:
 *  - The paired event must plausibly be ON DURING the golden window, not merely
 *    before sunset — a market that closes before golden hour isn't paired.
 *  - The component only renders the clause while golden hour is ACTIVE and
 *    re-validates the event against the LIVE client clock, so the two halves
 *    never disagree on tense.
 *
 * Pure + deterministic so it unit-tests against the honesty gates.
 */
import type { EventWithMeta } from "@/lib/loaders/events";
import { nextSunHint } from "@/lib/sun";
import { isUtilityEvent } from "@/lib/event-kind";
import { isEventToday } from "@/lib/eventWhenLabel";

// Category signals that read as outdoors…
const OUTDOOR_CATEGORIES = new Set([
  "outdoors", "park", "trail", "festival", "market", "food-truck", "sports", "nature",
]);
// …plus title patterns for outdoor draws that arrive mis-categorized (a
// fire-company carnival is tagged "community", a farmers market "community").
const OUTDOOR_TITLE =
  /\b(carnival|festival|fair\b|farmers?\s*market|night market|street\s*market|fireworks|parade|block party|car show|cruise[- ]?in|concert (on|in) the|in the park|outdoor|bonfire|stargaz|astronom|hike|nature walk|trail|garden|orchard|vineyard|tailgate|food truck|crab feast|fish fry)\b/i;
// Indoor giveaways that VETO a title-only outdoor match (a "Garden Club
// Meeting" or "Vineyard Community Church service" is indoors). The trusted
// outdoor CATEGORIES bypass this; only the loose title path is vetoed.
const INDOOR_TITLE =
  /\b(church|chapel|mass|worship|service|sermon|fellowship|bible|sunday school|meeting|hall|sanctuary|indoor|gymnasium|auditorium|theat(er|re)|cinema|library|museum|class|workshop|seminar|lecture|webinar)\b/i;

/** Is this event one whose value is tied to being outside in good light? */
export function isOutdoorEvent(e: { category?: string; title?: string }): boolean {
  if (e.category && OUTDOOR_CATEGORIES.has(e.category)) return true;
  const t = e.title ?? "";
  return OUTDOOR_TITLE.test(t) && !INDOOR_TITLE.test(t);
}

export type GoldenHourEvent = {
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  isAllDay: boolean;
  municipality_name: string;
};

/**
 * The soonest OUTDOOR, non-utility draw that is plausibly ON DURING today's
 * golden-hour window — so the component can pair it with the live light cue.
 * "On during golden" = all-day, OR a real end time that reaches golden start,
 * OR (when the end is unknown) a timed event starting within ~3h of golden
 * start (outdoor draws run for hours). Returns null when the sun is down, the
 * math is unavailable, or nothing qualifies (the UI then omits the pairing).
 */
export function pickGoldenHourOutdoorEvent(
  pool: EventWithMeta[],
  now: Date,
  lat: number,
  lng: number,
): GoldenHourEvent | null {
  // Gate on the SAME signal as the displayed golden cue (nextSunHint), so the
  // pairing and the cue always agree. `hint.from` = golden start, `to` = sunset.
  const hint = nextSunHint(now, lat, lng);
  if (!hint?.to || !hint.from) return null;
  const goldenStartMs = hint.from.getTime();
  const sunsetMs = hint.to.getTime();
  const nowMs = now.getTime();

  let best: EventWithMeta | null = null;
  let bestKey = Infinity;
  for (const e of pool) {
    if (isUtilityEvent(e)) continue;
    if (!isOutdoorEvent(e)) continue;
    if (!isEventToday(e.starts_at, now)) continue;
    const s = Date.parse(e.starts_at);
    if (Number.isNaN(s) || s > sunsetMs) continue; // can't begin after dark
    const end = Date.parse(e.ends_at);
    const hasEnd = !Number.isNaN(end) && end > s;
    const onDuringGolden = e.is_all_day === true
      ? true
      : hasEnd
        ? end >= goldenStartMs // trust a real end time
        : s >= goldenStartMs - 3 * 3_600_000; // unknown end: assume an evening draw runs into golden
    if (!onDuringGolden) continue;
    // Soonest still-relevant: already-started events sort as "now".
    const key = s < nowMs ? nowMs : s;
    if (key < bestKey) {
      best = e;
      bestKey = key;
    }
  }
  if (!best) return null;
  return {
    slug: best.slug,
    title: best.title,
    starts_at: best.starts_at,
    ends_at: best.ends_at,
    isAllDay: best.is_all_day === true,
    municipality_name: best.municipality_name,
  };
}
