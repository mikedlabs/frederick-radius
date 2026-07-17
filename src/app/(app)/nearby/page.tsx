import type { Metadata } from "next";
import { cookies } from "next/headers";
import { publicPlaces, decoratePlace, type PlaceCardData } from "@/lib/loaders/places";
import { isCravingPlace } from "@/data/cravings";
import RightNow from "@/components/now/RightNow";
import { approxLocation } from "@/lib/ip-geo";
import { parseScope, resolveDecisionContext, SCOPE_COOKIE } from "@/lib/scope";

export const metadata: Metadata = {
  alternates: { canonical: "/nearby" },
  title: "Nearby",
  description: "Find open food, coffee, drinks, shops, and things to do across Frederick County.",
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
  searchParams: Promise<{ c?: string; facet?: string; town?: string; in?: string }>;
}) {
  const { c, facet, town, in: scopeParam } = await searchParams;
  // Resolve the exact same origin policy as Today/Ask. The legacy ?town=
  // deep link remains supported, but canonical ?in= and the shared cookie
  // preserve county and near-me semantics instead of reducing everything to
  // a nullable town and accidentally letting IP override Whole county.
  const store = await cookies();
  // Edge IP geo: a coarse "which town" seed so a visitor outside Downtown ranks
  // from where they actually are BEFORE granting precise location. Ranking only,
  // never a printed distance. Null (out of area / no header) keeps the Downtown
  // default. Free at the edge; /nearby is already force-dynamic so reading the
  // request headers costs nothing extra. A rejected/outside-county result is
  // labeled in the client and never replaced with a hidden Downtown origin.
  const approx = await approxLocation();
  const scope = parseScope(scopeParam ?? town ?? store.get(SCOPE_COOKIE)?.value ?? null);
  const context = resolveDecisionContext({
    scopeRaw: scope,
    homeMuniRaw: store.get("fr_home_muni")?.value ?? null,
    approximateOrigin: approx.origin,
    approximateStatus: approx.status,
  });
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
      initialTown={context.filterMunicipality}
      initialScope={scope}
      initialOriginSource={context.source}
      approxOrigin={context.origin}
      approxCity={context.source === "home"
        ? context.label.replace(/^Ranked from /, "")
        : context.source === "ip"
          ? approx.city
          : null}
      approxStatus={context.fallbackReason === "outside-county" ? "outside-county" : approx.status}
    />
  );
}
