/**
 * LGBTQ+ community events — the lens the June Pride note always implied.
 *
 * The LGBTQ+ Frederick collection is places only (hand-verified, never
 * guessed), but the community's calendar was invisible: The Frederick
 * Center's programming (Queer Craft Night, Queeraoke, drag bingo
 * fundraisers) reaches the unified feed via venue ingestion + Eventbrite,
 * and nothing marked it. This classifier is that mark, and it follows the
 * live-music playbook: two honest signals, no guessing.
 *
 *  - TITLE says so: word-boundary, specific phrases, conservative default
 *    of `false` (same doctrine as classify.ts — a missed event is better
 *    than a wrong claim). "Pride" alone is NOT a signal ("Pride of
 *    Baltimore", team pride) — it counts only in event contexts ("Pride
 *    Night", "Frederick Pride"). "Drag" alone is NOT a signal (drag
 *    racing) — only "drag show/bingo/brunch/queen/…".
 *  - VENUE says so: an event AT The Frederick Center (the county's LGBTQ+
 *    community hub) is LGBTQ+ community programming by the venue's own
 *    mission — the same join LIVE_MUSIC_VENUE_SLUGS makes for stages.
 *
 * Like isLgbtqEvent's cousins, this asserts community relevance, never a
 * person's identity: it marks events, not attendees.
 */
import type { EventWithMeta } from "@/lib/loaders/events";

/** Places whose whole calendar is LGBTQ+ community programming. Grows the
 *  same way the collection does: verified, never inferred. */
export const LGBTQ_VENUE_SLUGS: ReadonlySet<string> = new Set(["the-frederick-center"]);

// Unambiguous community terms — safe at a word boundary. `lgbt` catches the
// whole acronym family (LGBT, LGBTQ+, LGBTQIA2S+); `queer` catches
// compounds like Queeraoke. "gay" excludes street names ("Gay Street").
const RE_TERMS =
  /\blgbt|\bqueer|\bsapphic\b|\bpflag\b|\btransgender\b|\bnon-?binary\b|\btwo-?spirit\b|\bgay\b(?!\s+street)|\blesbian\b|\bbisexual\b/i;

// "Pride" only in event contexts, or named local/regional Pride events.
const RE_PRIDE =
  /\bpride\s+(month|festival|fest|celebration|parade|picnic|prom|night|party|market|brunch|crawl|walk|ride|run|social|dance|drive|kickoff|happy\s+hour)\b|\b(frederick|maryland|md)\s+pride\b|\bpride\s+in\s+the\s+park\b/i;

// "Drag" only as performance, never motorsports ("drag race" stays out on
// purpose — Mason-Dixon Dragway is one county over).
const RE_DRAG = /\bdrag\s+(show|shows|brunch|bingo|queen|queens|king|kings|story|performance)\b/i;

export function isLgbtqTitle(title: string): boolean {
  const t = title ?? "";
  return RE_TERMS.test(t) || RE_PRIDE.test(t) || RE_DRAG.test(t);
}

/**
 * Is this an LGBTQ+ community event? Title signal or verified-venue join.
 * `venue_name` covers rows whose venue never resolved to a place slug
 * (e.g. a county feed listing "The Frederick Center" as free text).
 */
export function isLgbtqEvent(
  e: Pick<EventWithMeta, "title" | "venue_place_slug" | "venue_name">,
): boolean {
  if (isLgbtqTitle(e.title ?? "")) return true;
  if (e.venue_place_slug != null && LGBTQ_VENUE_SLUGS.has(e.venue_place_slug)) return true;
  return /\bfrederick\s+center\b/i.test(e.venue_name ?? "");
}
