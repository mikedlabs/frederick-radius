/**
 * Frederick Keys event detection + matchup parsing.
 *
 * The Keys (minor-league baseball at Nymeo Field at Harry Grove Stadium) reach
 * /today through two feeds — Ticketmaster sports and the authoritative MLB Stats
 * API layer (src/lib/integrations/frederickKeys.ts). Both stamp the home venue
 * "Nymeo Field at Harry Grove Stadium" and a title shaped "Frederick Keys vs.
 * <Opponent>". This module is the single seam that recognizes those rows so
 * /today can hand them a team-branded card (KeysCard) instead of the generic
 * EventCard — WITHOUT restyling EventCard for every other event.
 *
 * Data-free (types only) so it can be imported from a client or server module.
 */

/** The minimal event shape the detector needs — a loose subset of EventWithMeta
 *  so callers never have to widen a partial row to test it. */
export type KeysLike = {
  title?: string | null;
  venue_name?: string | null;
  source?: string | null;
  description?: string | null;
};

/** The home venue, however a feed spells it ("Nymeo Field at Harry Grove
 *  Stadium", "Harry Grove Stadium"). */
const NYMEO_RE = /nymeo field|harry\s*grove/i;

/**
 * Does this event relate to the Keys or their stadium? This broad detector
 * deliberately includes non-game stadium activities. Consumers promising a
 * baseball home game must use isKeysHomeGame instead; venue alone is not proof
 * that a career fair, concert or other stadium booking is a game.
 */
export function isKeysEvent(e: KeysLike | null | undefined): boolean {
  if (!e) return false;
  if ((e.source ?? "") === "frederick-keys") return true;
  if (e.venue_name && NYMEO_RE.test(e.venue_name)) return true;
  const t = e.title ?? "";
  return /frederick\s+keys/i.test(t) || /\bkeys\s+vs\.?\b/i.test(t);
}

const KEYS_TEAM_RE = /\b(?:frederick\s+)?keys\b/i;
const KEYS_MATCHUP_RE = /\b(?:frederick\s+)?keys\s+(?:vs\.?|versus)\s+\S|\S+\s+(?:vs\.?|versus)\s+(?:frederick\s+)?keys\b/i;
const WATCH_PARTY_RE = /\bwatch\s+part(?:y|ies)\b/i;
const NON_GAME_TITLE_RE = /\b(?:career\s+(?:days?|fairs?)|job\s+fairs?|concerts?|stadium\s+tours?|camps?|clinics?|tryouts?|trivia|fan\s*fest(?:ival)?s?)\b/i;
const EXPLICIT_GAME_RE = /\b(?:baseball\s+games?|home\s+games?|home\s+opener|first\s+pitch|post[-\s]?game|season\s+opener)\b/i;

/**
 * A Keys baseball HOME game, rather than any event booked at their stadium.
 * The dedicated Stats API adapter already checks the home team's identity.
 * Other feeds need the home venue plus a Keys matchup, or explicit game
 * evidence for a promotion-titled listing. A theme or venue alone is not
 * enough. Lifecycle status is deliberately untouched so cancelled/postponed
 * games can still explain a disrupted schedule.
 */
export function isKeysHomeGame(e: KeysLike | null | undefined): boolean {
  if (!e) return false;
  if (e.source === "frederick-keys") return true;
  if (!e.venue_name || !NYMEO_RE.test(e.venue_name)) return false;

  const title = e.title?.trim() ?? "";
  if (!title || WATCH_PARTY_RE.test(title)) return false;
  if (KEYS_MATCHUP_RE.test(title)) return true;
  if (NON_GAME_TITLE_RE.test(title)) return false;

  const evidence = `${title} ${e.description?.trim() ?? ""}`;
  return KEYS_TEAM_RE.test(evidence) && EXPLICIT_GAME_RE.test(evidence);
}

/**
 * The opponent named in a Keys matchup title, or null. Robust to either side of
 * the "vs": "Frederick Keys vs. Brooklyn Cyclones" and "Brooklyn Cyclones vs
 * Frederick Keys" both yield "Brooklyn Cyclones". Returns null for a title that
 * isn't a "X vs Y" matchup (e.g. a themed promo night).
 */
export function keysOpponent(title: string | null | undefined): string | null {
  const t = (title ?? "").trim();
  if (!t) return null;
  const parts = t.split(/\s+vs\.?\s+/i);
  if (parts.length < 2) return null;
  // The side that is NOT the Keys is the opponent.
  const opp = parts.map((p) => p.trim()).find((p) => p && !/keys/i.test(p));
  return opp ?? null;
}

/** The official box office — the honest fallback for any game without a
 *  per-game ticket page. */
export const KEYS_TICKETS_URL = "https://www.milb.com/frederick/tickets";

/**
 * The best ticket link for a Keys game. Curated rows can carry a real
 * ticket_url; FEED rows never do — the merge maps Ticketmaster's event-page
 * URL into source_url, not ticket_url (verified against liveToCardEvent), so
 * a bare `ticket_url ||` fallback silently sent every feed game to the box
 * office. The Ticketmaster event page IS the per-game ticket page, so use it
 * when that is where the row came from; everything else gets the box office.
 */
export function keysTicketUrl(e: {
  ticket_url?: string;
  source_url?: string | null;
}): string {
  if (e.ticket_url) return e.ticket_url;
  if (e.source_url && /ticketmaster\.com/i.test(e.source_url)) return e.source_url;
  return KEYS_TICKETS_URL;
}
