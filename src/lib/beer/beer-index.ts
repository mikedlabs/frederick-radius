import { ALL_BEERS, type BeerWithBrewery, type StyleFamily } from "@/data/beers";

/**
 * The Frederick Beer Index engine — the pure filter/sort/facet core behind
 * the /beer tool. A beer lover's real question is "show me the highest-rated
 * stouts in the county under 7%," and our data can answer it: 174 beers, each
 * with a style family, ABV, Untappd rating, and taste note.
 *
 * Pure + unit-tested; the React layer (BeerIndex.tsx) owns only state + paint.
 * Faceted like a real catalog: family counts reflect the OTHER active filters
 * (ABV / rating / town / search), so a count never promises rows a click won't
 * deliver.
 */

export type BeerSort = "rating" | "abv-desc" | "abv-asc" | "name";

export type BeerFilter = {
  /** Free text over beer name, brewery, style, and taste note. */
  q: string;
  /** Selected style families (OR within the set; empty = all). */
  families: StyleFamily[];
  /** Inclusive ABV bounds; null = open. */
  minAbv: number | null;
  maxAbv: number | null;
  /** Minimum Untappd rating; null = any (INCLUDING unrated). A set floor
   *  drops unrated beers, since "at least 3.8" can't vouch for a blank. */
  minRating: number | null;
  /** Municipality slug; null = anywhere. */
  town: string | null;
  /** Brewery slug; null = all breweries. */
  brewerySlug: string | null;
  /** Only the breweries' flagship pours. */
  flagshipOnly: boolean;
};

export const EMPTY_BEER_FILTER: BeerFilter = {
  q: "",
  families: [],
  minAbv: null,
  maxAbv: null,
  minRating: null,
  town: null,
  brewerySlug: null,
  flagshipOnly: false,
};

/** True when the filter is doing nothing (the whole index shows). */
export function isEmptyBeerFilter(f: BeerFilter): boolean {
  return (
    f.q.trim() === "" &&
    f.families.length === 0 &&
    f.minAbv == null &&
    f.maxAbv == null &&
    f.minRating == null &&
    f.town == null &&
    f.brewerySlug == null &&
    !f.flagshipOnly
  );
}

/** Apply every dimension EXCEPT the style family — the base the family facet
 *  counts against, so each family chip shows how many rows it would add given
 *  the rest of the current filter (the standard faceted-search contract). */
function matchesExceptFamily(beer: BeerWithBrewery, f: BeerFilter): boolean {
  const term = f.q.trim().toLowerCase();
  if (term) {
    const hay = `${beer.name} ${beer.breweryName} ${beer.style} ${beer.notes}`.toLowerCase();
    if (!hay.includes(term)) return false;
  }
  if (f.minAbv != null && (beer.abv == null || beer.abv < f.minAbv)) return false;
  if (f.maxAbv != null && (beer.abv == null || beer.abv > f.maxAbv)) return false;
  if (f.minRating != null && (beer.rating == null || beer.rating < f.minRating)) return false;
  if (f.town != null && beer.town !== f.town) return false;
  if (f.brewerySlug != null && beer.brewerySlug !== f.brewerySlug) return false;
  if (f.flagshipOnly && !beer.flagship) return false;
  return true;
}

function matchesFamily(beer: BeerWithBrewery, families: StyleFamily[]): boolean {
  return families.length === 0 || families.includes(beer.family);
}

/** The filtered, unsorted set. */
export function filterBeers(beers: BeerWithBrewery[], f: BeerFilter): BeerWithBrewery[] {
  return beers.filter((b) => matchesExceptFamily(b, f) && matchesFamily(b, f.families));
}

const SORTERS: Record<BeerSort, (a: BeerWithBrewery, b: BeerWithBrewery) => number> = {
  // Highest Untappd rating first; unrated sink to the bottom. Name breaks ties
  // so the order is deterministic (SSR-stable).
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name),
  "abv-desc": (a, b) => (b.abv ?? -1) - (a.abv ?? -1) || a.name.localeCompare(b.name),
  "abv-asc": (a, b) => (a.abv ?? Infinity) - (b.abv ?? Infinity) || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
};

export function sortBeers(beers: BeerWithBrewery[], sort: BeerSort): BeerWithBrewery[] {
  return [...beers].sort(SORTERS[sort]);
}

/** filter + sort in one call. */
export function queryBeers(f: BeerFilter, sort: BeerSort, beers: BeerWithBrewery[] = ALL_BEERS): BeerWithBrewery[] {
  return sortBeers(filterBeers(beers, f), sort);
}

/** Count of beers each style family would yield under the rest of the current
 *  filter — powers the facet chips' live counts. Family selection itself is
 *  excluded from the base so selecting one family doesn't zero the others. */
export function familyFacetCounts(f: BeerFilter, beers: BeerWithBrewery[] = ALL_BEERS): Record<string, number> {
  const base = beers.filter((b) => matchesExceptFamily(b, f));
  const counts: Record<string, number> = {};
  for (const b of base) counts[b.family] = (counts[b.family] ?? 0) + 1;
  return counts;
}
