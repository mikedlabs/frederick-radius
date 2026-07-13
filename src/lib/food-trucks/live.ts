import { clientPlaces } from "@/lib/loaders/places-client";
import type { Hours } from "@/data/places";

/**
 * Food-truck live layer, phase 1: the home-base reading.
 *
 * Most trucks roam (their daily spot lives on their own feed), but a few
 * park permanently at a brewery kitchen. For those, "is it out right now?"
 * is answerable honestly TODAY: the brewery's posted, verified hours are a
 * true proxy for whether the truck is serving. So resolve a truck's
 * `homeBase` string to its place record and hand the hours to a client
 * component that computes open/closed on the visitor's clock.
 *
 * This is deliberately the honest slice: it only speaks for trucks with a
 * real permanent home whose venue hours we actually hold. Roaming trucks
 * keep the "follow their feed" path until the operator-beacon or a real
 * schedule feed lands. Pure resolution (no network); safe on server + client.
 */

export type HomeBaseResolved = {
  /** The venue's canonical name, for the card line. */
  name: string;
  /** Place slug, so the card can link through to the venue. */
  slug: string;
  hours: Hours;
  verified: boolean;
};

const norm = (s: string): string => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Resolve a truck's free-text `homeBase` ("Monocacy Brewing Company") to a
 * place with hours. Exact normalized-name match first, then a forgiving
 * prefix match either direction ("Monocacy Brewing Company" ~ "Monocacy
 * Brewing"), guarded by a length floor so short venue names can't
 * over-match. Returns null when nothing resolves or the match has no hours,
 * so the card falls back to the static "Usually at X" line.
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
  if (!match || !match.hours) return null;
  return {
    name: match.name,
    slug: match.slug,
    hours: match.hours as Hours,
    verified: Boolean(match.hours_verified),
  };
}
