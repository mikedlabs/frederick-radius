import type { BeerWithBrewery, StyleFamily } from "@/data/beers";

export type TastePathKey = "crisp" | "hoppy" | "dark" | "tart" | "old-world";
export type BeerStrength = "easy" | "any" | "bold";

export type TastePath = {
  key: TastePathKey;
  label: string;
  shortLabel: string;
  description: string;
  families: readonly StyleFamily[];
  colors: readonly [string, string];
};

export const TASTE_PATHS: readonly TastePath[] = [
  {
    key: "hoppy",
    label: "Hoppy & hazy",
    shortLabel: "Hoppy",
    description: "These beers bring citrus, pine, soft haze, and a little bitterness.",
    families: ["ipa", "wheat-hazy"],
    colors: ["#D89A2B", "#7A4A0E"],
  },
  {
    key: "crisp",
    label: "Crisp & easy",
    shortLabel: "Crisp",
    description: "This path covers clean lagers and balanced everyday pours.",
    families: ["lager-pilsner", "pale-ale"],
    colors: ["#D9B74B", "#6E5410"],
  },
  {
    key: "dark",
    label: "Dark & roasty",
    shortLabel: "Dark",
    description: "These beers lean toward coffee, chocolate, caramel, and toasted malt.",
    families: ["stout-porter", "amber-brown"],
    colors: ["#7B4B34", "#241610"],
  },
  {
    key: "tart",
    label: "Tart & unusual",
    shortLabel: "Tart",
    description: "This path covers tart fruit beers and unusual specialty pours.",
    families: ["sour-wild", "specialty-other"],
    colors: ["#C44778", "#4A245F"],
  },
  {
    key: "old-world",
    label: "Belgian & farmhouse",
    shortLabel: "Old world",
    description: "These beers are dry and rustic, with spice from expressive yeast.",
    families: ["belgian-farmhouse", "wheat-hazy"],
    colors: ["#C59024", "#61420B"],
  },
] as const;

export const TASTE_PATH_BY_KEY: Record<TastePathKey, TastePath> = Object.fromEntries(
  TASTE_PATHS.map((path) => [path.key, path]),
) as Record<TastePathKey, TastePath>;

function fitsStrength(beer: BeerWithBrewery, strength: BeerStrength): boolean {
  if (strength === "any") return true;
  if (beer.abv == null) return false;
  return strength === "easy" ? beer.abv <= 5.5 : beer.abv >= 8;
}

const HOPPY_HAZE_STYLE = /\b(?:ipa|india pale ale|pale ale)\b/i;
const TRADITIONAL_WHEAT_STYLE = /\b(?:wit(?:bier)?|wheat|hefeweizen|weiss(?:bier)?|weizen|dunkelweizen)\b/i;

/** Style-family data intentionally groups hazy IPAs and traditional wheat
 * beers together. These two taste paths must split that family by the actual
 * style name so the promise on the button matches the pour underneath it. */
export function beerMatchesTastePath(
  beer: Pick<BeerWithBrewery, "family" | "style">,
  pathKey: TastePathKey,
): boolean {
  if (pathKey === "hoppy") {
    return beer.family === "ipa" || (beer.family === "wheat-hazy" && HOPPY_HAZE_STYLE.test(beer.style));
  }
  if (pathKey === "old-world") {
    return beer.family === "belgian-farmhouse"
      || (beer.family === "wheat-hazy" && TRADITIONAL_WHEAT_STYLE.test(beer.style) && !HOPPY_HAZE_STYLE.test(beer.style));
  }
  return TASTE_PATH_BY_KEY[pathKey].families.includes(beer.family);
}

function rankBeers(a: BeerWithBrewery, b: BeerWithBrewery): number {
  if (a.flagship !== b.flagship) return a.flagship ? -1 : 1;
  const ratingDifference = (b.rating ?? -1) - (a.rating ?? -1);
  if (ratingDifference !== 0) return ratingDifference;
  const breweryDifference = a.breweryName.localeCompare(b.breweryName);
  if (breweryDifference !== 0) return breweryDifference;
  return a.name.localeCompare(b.name);
}

/**
 * Build a small, varied flight from the durable signature-pour catalog.
 * Results are deterministic, never repeat a brewery, and never silently
 * escape the requested strength range. Ratings only break ties after the
 * more useful flagship signal.
 */
export function buildTasteFlight(
  beers: readonly BeerWithBrewery[],
  pathKey: TastePathKey,
  strength: BeerStrength,
  limit = 3,
): BeerWithBrewery[] {
  if (limit <= 0) return [];

  const path = TASTE_PATH_BY_KEY[pathKey];
  const eligible = beers
    .filter((beer) => beerMatchesTastePath(beer, pathKey) && fitsStrength(beer, strength))
    .sort(rankBeers);

  const chosen: BeerWithBrewery[] = [];
  const usedBreweries = new Set<string>();
  const usedBeerKeys = new Set<string>();

  const take = (beer: BeerWithBrewery | undefined) => {
    if (!beer || chosen.length >= limit || usedBreweries.has(beer.brewerySlug)) return;
    const key = `${beer.brewerySlug}::${beer.name}`;
    if (usedBeerKeys.has(key)) return;
    chosen.push(beer);
    usedBreweries.add(beer.brewerySlug);
    usedBeerKeys.add(key);
  };

  // Give each family in the selected taste path a chance to appear before
  // filling the remaining glass. This keeps a flight from becoming three IPAs.
  for (const family of path.families) {
    take(eligible.find((beer) => beer.family === family && !usedBreweries.has(beer.brewerySlug)));
  }

  for (const beer of eligible) take(beer);
  return chosen;
}

export function tastePathStats(
  beers: readonly BeerWithBrewery[],
  pathKey: TastePathKey,
): { beers: number; breweries: number } {
  const matches = beers.filter((beer) => beerMatchesTastePath(beer, pathKey));
  return {
    beers: matches.length,
    breweries: new Set(matches.map((beer) => beer.brewerySlug)).size,
  };
}
