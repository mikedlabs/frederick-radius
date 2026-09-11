import { clientPlaces } from "@/lib/loaders/places-client";
import type { Hours } from "@/data/places";

/**
 * Food-truck home-base resolver.
 *
 * Most trucks roam (their daily spot lives on their own feed), but a few
 * are associated with a brewery kitchen. Venue hours can help someone plan a
 * visit, but they are not evidence that the truck is serving. This resolver
 * only joins a truck's `homeBase` string to the venue record so the interface
 * can label the relationship and show the venue's hours separately.
 *
 * Roaming trucks keep the official schedule/feed path until an operator
 * beacon confirms a live location. Pure resolution; safe on server + client.
 */

export type HomeBaseResolved = {
  /** The venue's canonical name, for the card line. */
  name: string;
  /** Place slug, so the card can link through to the venue. */
  slug: string;
  /** Fresh, publishable venue hours when available. Home-base identity does
   * not disappear merely because the venue schedule needs re-verification. */
  hours?: Hours;
  verified: boolean;
};

const norm = (s: string): string => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Resolve a truck's free-text `homeBase` ("Monocacy Brewing Company") to a
 * place. Exact normalized-name match first, then a forgiving
 * prefix match either direction ("Monocacy Brewing Company" ~ "Monocacy
 * Brewing"), guarded by a length floor so short venue names can't
 * over-match. Fresh hours are attached when the public place loader can
 * safely publish them; stale hours never erase the known venue relationship.
 */
export function resolveHomeBase(homeBase: string | undefined): HomeBaseResolved | null {
  if (!homeBase) return null;
  const target = norm(homeBase);
  if (target.length < 4) return null;
  const places = clientPlaces();

  let match = places.find((p) => norm(p.name) === target);
  if (!match) {
    match = places.find((p) => {
      const pk = norm(p.name);
      if (pk.length < 6) return false;
      return pk.startsWith(target) || target.startsWith(pk);
    });
  }
  if (!match) return null;
  return {
    name: match.name,
    slug: match.slug,
    hours: match.hours as Hours | undefined,
    verified: Boolean(match.hours_verified),
  };
}
