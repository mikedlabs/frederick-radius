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
  openCount: number;
  tonightCount: number;
  tonightBest: Best;
  weekendCount: number;
  weekendBest: Best;
  parking: { name: string; slug: string } | null;
};

const place = (n: number) => `${n} ${n === 1 ? "place" : "places"}`;
const atVenue = (b: Best) => (b?.venue ? ` at ${b.venue}` : "");

export function buildTodayAnswers(input: TodayAnswerInput): Answer[] {
  const out: Answer[] = [];

  // 1. Open now — only with a confirmed count.
  if (input.openCount > 0) {
    out.push({
      id: "open-now",
      status: "open-now",
      title: `${place(input.openCount)} open near downtown`,
      answer: "Confirmed open right now, close to downtown.",
      whyShown: "Open this hour, within reach",
      sourceLabel: "Google Places",
      freshnessLabel: "checked today",
      primaryAction: { label: "See what's open", href: "/map?mode=browse&open=now" },
      secondaryAction: { label: "All places", href: "/places" },
    });
  }

  // 2. Tonight.
  if (input.tonightCount > 0) {
    const b = input.tonightBest;
    out.push({
      id: "tonight",
      status: "tonight",
      title: input.tonightCount === 1 ? "1 event tonight" : `${input.tonightCount} events tonight`,
      answer: b ? `Best bet: ${b.title}${atVenue(b)}.` : undefined,
      whyShown: "Starting this evening",
      sourceLabel: "Frederick event calendars",
      primaryAction: { label: "See tonight", href: "/today?t=tonight" },
      secondaryAction: b ? { label: "Details", href: `/events/${b.slug}` } : { label: "All events", href: "/events" },
    });
  }

  // 3. This weekend.
  if (input.weekendCount > 0) {
    const b = input.weekendBest;
    out.push({
      id: "weekend",
      status: "weekend",
      title: `${input.weekendCount} this weekend`,
      answer: b ? `Don't miss ${b.title}${atVenue(b)}.` : undefined,
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
