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
};

/** The home venue, however a feed spells it ("Nymeo Field at Harry Grove
 *  Stadium", "Harry Grove Stadium"). */
const NYMEO_RE = /nymeo field|harry\s*grove/i;

/**
 * Is this a Frederick Keys home game? True when ANY authoritative signal holds:
 *   • the row came from the Keys Stats-API feed (source "frederick-keys"),
 *   • the venue is Nymeo Field / Harry Grove Stadium, or
 *   • the title names the Keys ("Frederick Keys …", "… Keys vs …").
 * Honest by construction: a non-Keys event at another venue never matches.
 */
export function isKeysEvent(e: KeysLike | null | undefined): boolean {
  if (!e) return false;
  if ((e.source ?? "") === "frederick-keys") return true;
  if (e.venue_name && NYMEO_RE.test(e.venue_name)) return true;
  const t = e.title ?? "";
  return /frederick\s+keys/i.test(t) || /\bkeys\s+vs\.?\b/i.test(t);
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
