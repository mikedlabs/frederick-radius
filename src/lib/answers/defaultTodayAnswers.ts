import type { Answer } from "./types";
import { formatDistance } from "@/lib/geo";

/**
 * Build the default anticipatory answers for /today — the 3 to 5 cards
 * a first-time user sees before they ask anything (UX_REDO Build 1).
 *
 * Pure and honest: every card is gated on real, caller-supplied data.
 * If a window is empty (no events tonight, no count), its card is
 * omitted rather than faked. Transit is the always-available civic
 * anchor and routes to the real surface (no fabricated "next train").
 *
 * Inputs come from the loaders /today already computes, so this adds no
 * new data coupling.
 */

type Best = { title: string; venue?: string | null; slug: string } | null;

export type TodayAnswerInput = {
  openCount: number;
  /** The single best open-now pick (getOpenNowLead) — lets the open-now
   *  card NAME a real place instead of an abstract "open near downtown".
   *  Optional/null: the card falls back to a count-only line. distance_m
   *  is from the downtown anchor the picks are ranked against. */
  openLead?: { name: string; distance_m: number; slug: string } | null;
  tonightCount: number;
  tonightBest: Best;
  weekendCount: number;
  weekendBest: Best;
  parking: { name: string; slug: string } | null;
  /** Slug of the event already shown as the prominent featured hero
   *  (TodayMoves "best move now" + the "What's on" hero). When a
   *  tonight/weekend best bet IS that event, its answer card drops the
   *  named "Best bet: X" line and becomes a count + door, so the same
   *  event is never named twice on the page. A *different* best bet is
   *  still named — that's additive, not a duplicate. */
  featuredSlug?: string | null;
};

const atVenue = (b: Best) => (b?.venue ? ` at ${b.venue}` : "");

export function buildTodayAnswers(input: TodayAnswerInput): Answer[] {
  const out: Answer[] = [];

  // 1. Open now — gated on a confirmed count, but now NAMES a real open
  //    pick when we have one. The old card ("Open near downtown" /
  //    "Confirmed open right now, close to downtown") was the biggest,
  //    photo-plated card on the page yet said the least: no place, no
  //    number, and a "near downtown" proximity the county-wide count never
  //    actually computed. Counts still never headline — the headline is the
  //    place name; the count drops to the supporting line; the distance
  //    (from the downtown anchor the picks rank against) fills the card's
  //    mono data slot. NearbyNow above handles true "near you" geo.
  if (input.openCount > 0) {
    const lead = input.openLead ?? null;
    // Only show the distance when it reads as a real proximity from
    // downtown; a far-flung county pick's distance isn't its selling point.
    const dist =
      lead && lead.distance_m > 0 && lead.distance_m < 8047
        ? formatDistance(lead.distance_m)
        : undefined;
    out.push({
      id: "open-now",
      status: "open-now",
      title: lead ? `${lead.name} is open now` : "Open right now",
      answer: lead
        ? input.openCount > 1
          ? `Plus ${input.openCount - 1} more food and drink spots open across the county.`
          : "Open right now across the county."
        : `${input.openCount} food and drink spots open right now across the county.`,
      whyShown: "Open this hour",
      sourceLabel: "Google Places",
      freshnessLabel: "checked today",
      distanceLabel: dist,
      primaryAction: { label: "See what's open", href: "/map?mode=browse&open=now" },
      secondaryAction: { label: "All places", href: "/places" },
    });
  }

  // 2. Tonight. Name the best bet only when it isn't already the
  //    featured hero shown elsewhere on the page (else count + door).
  if (input.tonightCount > 0) {
    const b = input.tonightBest;
    const named = b && b.slug !== input.featuredSlug ? b : null;
    out.push({
      id: "tonight",
      status: "tonight",
      // Insight leads, not the tally — the named best bet (when present) or
      // the "tonight" status chip carries the substance; the count lives in
      // the TimeToggle, not three places at once.
      title: "On tonight",
      answer: named ? `Best bet: ${named.title}${atVenue(named)}.` : undefined,
      whyShown: "Starting this evening",
      sourceLabel: "Frederick event calendars",
      primaryAction: { label: "See tonight", href: "/today?t=tonight" },
      secondaryAction: named ? { label: "Details", href: `/events/${named.slug}` } : { label: "All events", href: "/events" },
    });
  }

  // 3. This weekend. Same rule — don't re-name the featured hero.
  if (input.weekendCount > 0) {
    const b = input.weekendBest;
    const named = b && b.slug !== input.featuredSlug ? b : null;
    out.push({
      id: "weekend",
      status: "weekend",
      title: "This weekend",
      answer: named ? `Don't miss ${named.title}${atVenue(named)}.` : undefined,
      whyShown: "Coming up Friday to Sunday",
      sourceLabel: "Frederick event calendars",
      primaryAction: { label: "See the weekend", href: "/today?t=weekend" },
      secondaryAction: { label: "All events", href: "/events" },
    });
  }

  // 4. Parking — real garage metadata. Rates are intentionally NOT
  //    asserted (the data marks them placeholder), so we never imply a
  //    price we can't source.
  if (input.parking) {
    out.push({
      id: "parking",
      status: "parking",
      title: "Parking downtown",
      answer: `${input.parking.name} is an easy starting point for downtown.`,
      whyShown: "Downtown parking",
      sourceLabel: "City of Frederick parking",
      primaryAction: { label: "On the map", href: "/map?mode=browse&intent=parking" },
      secondaryAction: { label: "All garages", href: "/parking" },
    });
  }

  // 5. Transit — the always-on civic anchor. Routes to the real transit
  //    surface; we do NOT fabricate a departure time here.
  out.push({
    id: "transit",
    status: "transit",
    title: "MARC & transit",
    answer: "Brunswick Line trains and TransIT bus routes across the county.",
    whyShown: "Getting around",
    sourceLabel: "MTA Maryland · TransIT",
    primaryAction: { label: "See transit", href: "/transit" },
  });

  // Tight 3 to 5. Data-backed cards lead; transit anchors the tail.
  return out.slice(0, 5);
}
