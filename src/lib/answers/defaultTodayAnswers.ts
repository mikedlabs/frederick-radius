import type { Answer } from "./types";

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
  tonightCount: number;
  tonightBest: Best;
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

/**
 * The evergreen lead when nothing is data-backed for the answer section
 * (e.g. a quiet weekday morning with no tonight event). The answer-first
 * promise must hold at 11am, not only at 6pm — an empty front door reads as
 * "nothing here." This is honest by construction: no fabricated count or time,
 * just the two always-true field-guide doors (the map of every place, and the
 * full calendar). NOT a future-events look-ahead — /today stays today-first.
 * Rendered ONLY when buildTodayAnswers yields no lead cards.
 */
export const TODAY_EXPLORE_FALLBACK: Answer = {
  id: "explore",
  status: "events",
  statusLabel: "Explore",
  title: "Find something worth the trip",
  answer: "Browse Frederick County's places on the map, or see what's coming up on the calendar.",
  sourceLabel: "Frederick Radius field guide",
  primaryAction: { label: "Open the map", href: "/map?mode=browse" },
  secondaryAction: { label: "See what's on", href: "/events" },
};

export function buildTodayAnswers(input: TodayAnswerInput): Answer[] {
  const out: Answer[] = [];

  // (The open-now lead card was removed on 2026-06-15 at the owner's call —
  //  it was the weakest of the answer cards. /today now leads with the
  //  time-window answers below; NearbyNow above still covers "open near you"
  //  once the user shares location, which is the honest version of "open now".)

  // 1. Tonight. Name the best bet only when it isn't already the
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

  // (The standalone "This weekend" card was removed on 2026-06-15 — /today
  //  is a TODAY-first briefing, and a Friday-to-Sunday card was wrongly
  //  inheriting the photo-plated hero on quiet weekdays. Weekend now lives
  //  in the "What's on" TimeToggle's Weekend chip + one quiet tail link.)

  // 2. Parking — real garage metadata. Rates are intentionally NOT
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
