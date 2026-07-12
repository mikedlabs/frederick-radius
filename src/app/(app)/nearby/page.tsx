import type { Metadata } from "next";
import { cookies } from "next/headers";
import { publicPlaces, decoratePlace, type PlaceCardData } from "@/lib/loaders/places";
import { isCravingPlace } from "@/data/cravings";
import RightNow from "@/components/now/RightNow";
import { approxLocation } from "@/lib/ip-geo";
import { parseScope, scopeTownSlug, SCOPE_COOKIE } from "@/lib/scope";

export const metadata: Metadata = {
  alternates: { canonical: "/nearby" },
  title: "Right now",
  description: "Tap what you want: coffee, ice cream, food. Get the nearest one that's open.",
};

// open_status is time-sensitive: a cached page would say "open" after close.
export const dynamic = "force-dynamic";

/**
 * /nearby — the one-tap craving answer (revived for the 2026 free-evening
 * standard: "say the noun, get the closest open answer"). The /today
 * CravingStrip chips deep-link here as /nearby?c=<craving>.
 *
 * We decorate every public place (so open_status is computed for THIS
 * request), keep only the ones a craving can answer, and slim off the
 * heavy detail-only fields before shipping to the client. The client then
 * ranks "nearest open" against the user's live location. Filtering to
 * craving-eligible places keeps the SSR payload a fraction of the full
 * catalog.
 */
function slim(p: PlaceCardData): PlaceCardData {
  return {
    ...p,
    google_photos: [],
    description: undefined,
    review_snippet: undefined,
    review_author: undefined,
    google_hours: undefined,
    hours: undefined,
    amenities: undefined,
  };
}

export default async function NowPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; facet?: string; town?: string }>;
}) {
  const { c, facet, town } = await searchParams;
  // Town seed precedence (UX-02): a shared URL ?town= wins; then the global
  // browsing SCOPE lens (fr_scope) set from the nav chip; else null, which
  // lets IP-geo below choose. A "whole county" / "near me" scope carries no
  // town, so it falls through to the geo seed — exactly right.
  const store = await cookies();
  const scopeTown = scopeTownSlug(parseScope(store.get(SCOPE_COOKIE)?.value ?? null));
  // Edge IP geo: a coarse "which town" seed so a visitor outside Downtown ranks
  // from where they actually are BEFORE granting precise location. Ranking only,
  // never a printed distance. Null (out of area / no header) keeps the Downtown
  // default. Free at the edge; /nearby is already force-dynamic so reading the
  // request headers costs nothing extra.
  const approx = await approxLocation();
  const places = publicPlaces()
    // Filter to craving-eligible FIRST (the matcher only reads category + name,
    // both on the raw Place), then decorate only that subset instead of
    // decorating all ~1,700 places and discarding most. A per-request CPU cut
    // with zero behavior or freshness change — open-now stays computed live,
    // which is the whole point of this page, so we deliberately do NOT cache it.
    .filter((p) => isCravingPlace(p))
    .map((p) => decoratePlace(p))
    .map(slim);

  return (
    <RightNow
      places={places}
      initialCraving={c ?? null}
      initialFacet={facet ?? null}
      initialTown={town ?? scopeTown ?? null}
      approxOrigin={approx.origin}
      approxCity={approx.city}
    />
  );
}
