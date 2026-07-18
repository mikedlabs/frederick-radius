import RAW from "./beers.json" with { type: "json" };

/**
 * Frederick County beer directory — the data behind /beer (the swipe deck,
 * the taste finder, and the brewery result).
 *
 * Durable-by-design: we store each brewery's flagship and signature beers,
 * their styles, ABV, taste notes, and Untappd rating. Rotating taps are NOT
 * snapshotted here (they would be stale in a week); for what's pouring right
 * now, each beer and brewery deep-links to Untappd. Every brewery slug
 * resolves to a real place in the catalog (validated at build), so a beer can
 * always link to its brewery's page and the beer-day plan.
 *
 * Source: brewery sites + Untappd, gathered July 2026. These 17 brewery guides
 * are an editorial snapshot, not an operating-status directory. The UI asks
 * visitors to verify access, hours, and availability with each brewery.
 */

export type StyleFamily =
  | "ipa"
  | "pale-ale"
  | "lager-pilsner"
  | "wheat-hazy"
  | "amber-brown"
  | "stout-porter"
  | "sour-wild"
  | "belgian-farmhouse"
  | "specialty-other";

export type Beer = {
  name: string;
  style: string;
  family: StyleFamily;
  abv: number | null;
  notes: string;
  flagship: boolean;
  rating: number | null;
  untappd: string | null;
};

export type Brewery = {
  slug: string; // resolves to a place in the catalog
  name: string;
  town: string; // municipality slug
  focus: string;
  untappd: string | null;
  beers: Beer[];
};

export const BREWERIES: Brewery[] = (RAW as { breweries: Brewery[] }).breweries;

export type BeerWithBrewery = Beer & {
  brewerySlug: string;
  breweryName: string;
  town: string;
};

/** Every beer, flattened, each carrying its brewery. */
export const ALL_BEERS: BeerWithBrewery[] = BREWERIES.flatMap((b) =>
  b.beers.map((be) => ({
    ...be,
    brewerySlug: b.slug,
    breweryName: b.name,
    town: b.town,
  })),
);

export const BREWERY_BY_SLUG: Record<string, Brewery> = Object.fromEntries(
  BREWERIES.map((b) => [b.slug, b]),
);

/** Stable id for a beer in the shared saved store ("My taps"). */
export function beerKey(b: { brewerySlug: string; name: string }): string {
  return `${b.brewerySlug}::${b.name}`;
}

export const BEER_BY_KEY: Record<string, BeerWithBrewery> = Object.fromEntries(
  ALL_BEERS.map((b) => [beerKey(b), b]),
);

/**
 * Style-family palette. Each beer renders as a card colored by what it is.
 * These are a deliberate data-visualization palette (beer by style), not app
 * chrome, so they live here as documented constants rather than --app-* tokens.
 * Colors are chosen dark enough that large white display text clears 3:1 on
 * the darker end of each card's gradient (`deep`).
 */
export type FamilyMeta = {
  key: StyleFamily;
  label: string; // chip label, sentence case
  tagline: string; // one plain line for the taste finder
  base: string; // card top color
  deep: string; // card bottom color (text sits here; keeps white legible)
};

export const STYLE_FAMILIES: FamilyMeta[] = [
  { key: "ipa", label: "Hoppy IPA", tagline: "Expect firm bitterness with citrus and pine.", base: "#C7841F", deep: "#7A4A0E" },
  { key: "wheat-hazy", label: "Hazy and juicy", tagline: "Expect soft fruit with low bitterness.", base: "#D08A32", deep: "#8A5212" },
  { key: "pale-ale", label: "Pale and easy", tagline: "These beers stay balanced and easy to drink.", base: "#B8912F", deep: "#75570F" },
  { key: "lager-pilsner", label: "Crisp and clean", tagline: "These lagers are light, refreshing, and easy to drink.", base: "#B08A1C", deep: "#6E5410" },
  { key: "amber-brown", label: "Malty and toasty", tagline: "Expect caramel and toasted-malt flavors.", base: "#9A5C2A", deep: "#5E3316" },
  { key: "stout-porter", label: "Dark and roasty", tagline: "Expect coffee, chocolate, and roasted malt.", base: "#4A3128", deep: "#241610" },
  { key: "belgian-farmhouse", label: "Belgian and farmhouse", tagline: "Expect dry beer with spicy yeast character.", base: "#B5811E", deep: "#6F4C0E" },
  { key: "sour-wild", label: "Sour and funky", tagline: "These beers are tart and fruity.", base: "#B33A6E", deep: "#711E44" },
  { key: "specialty-other", label: "Something different", tagline: "Expect fruit, dessert flavors, or something harder to classify.", base: "#6E4E88", deep: "#402B53" },
];

export const FAMILY_BY_KEY: Record<StyleFamily, FamilyMeta> = Object.fromEntries(
  STYLE_FAMILIES.map((f) => [f.key, f]),
) as Record<StyleFamily, FamilyMeta>;

/** Beers worth putting in the swipe deck: flagships and well-rated pours,
 *  capped per brewery so no single brewery dominates the deck. Order is not
 *  shuffled here (SSR-stable); the client shuffles on mount. */
export function deckBeers(): BeerWithBrewery[] {
  const perBrewery = new Map<string, number>();
  const out: BeerWithBrewery[] = [];
  // Flagships first, then by rating, so the deck opens with signature beers.
  const ranked = [...ALL_BEERS].sort((a, b) => {
    if (a.flagship !== b.flagship) return a.flagship ? -1 : 1;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
  for (const beer of ranked) {
    const n = perBrewery.get(beer.brewerySlug) ?? 0;
    if (n >= 6) continue; // cap per brewery
    perBrewery.set(beer.brewerySlug, n + 1);
    out.push(beer);
  }
  return out;
}

/** Which breweries pour beers in the given liked families, ranked by how many
 *  of the user's likes they can serve (then by best rating). Drives the result. */
export function breweriesForFamilies(
  families: StyleFamily[],
): Array<{ brewery: Brewery; matches: BeerWithBrewery[] }> {
  const want = new Set(families);
  return BREWERIES.map((brewery) => ({
    brewery,
    matches: ALL_BEERS.filter(
      (be) => be.brewerySlug === brewery.slug && want.has(be.family),
    ),
  }))
    .filter((r) => r.matches.length > 0)
    .sort((a, b) => {
      if (b.matches.length !== a.matches.length) return b.matches.length - a.matches.length;
      const ar = Math.max(...a.matches.map((m) => m.rating ?? 0));
      const br = Math.max(...b.matches.map((m) => m.rating ?? 0));
      return br - ar;
    });
}

/** Playful title for a taste profile, chosen by the dominant liked family. */
export function tasteTitle(families: StyleFamily[]): string {
  const first = families[0];
  const map: Partial<Record<StyleFamily, string>> = {
    ipa: "Hop Hunter",
    "wheat-hazy": "Haze Chaser",
    "pale-ale": "Easy Rider",
    "lager-pilsner": "Lager Loyalist",
    "amber-brown": "Malt Head",
    "stout-porter": "Dark Sider",
    "sour-wild": "Sour Seeker",
    "belgian-farmhouse": "Farmhouse Friend",
    "specialty-other": "Wild Card",
  };
  return (first && map[first]) || "Frederick Regular";
}

/** Frederick County beer history — a short, sourced arc for the /beer page.
 *  See docs/VOICE.md: plain, no hype, no em dashes. Some framing is flagged
 *  unverified below and should not be stated as settled fact. */
export const BEER_HISTORY = {
  summary:
    "Beer making has been part of Frederick since German immigrants settled here in the 1700s. For roughly 153 years small breweries ran along Carroll Creek in a district known as Brewer's Alley, until a fire ended that era in 1901. The town went without a commercial brewery for most of the next century, until the Brewer's Alley brewpub revived the name in 1996. Today Frederick County is one of Maryland's leading beer destinations.",
  milestones: [
    { year: "1740s", title: "German settlers and the first brewers", detail: "Frederick Town was laid out in the 1740s, and German families were brewing here from the county's earliest days." },
    { year: "1800s", title: "The Brewer's Alley district", detail: "Through the 19th century a run of small, largely German-run breweries operated along Carroll Creek in a district known as Brewer's Alley, on what is today South Court Street." },
    { year: "1901", title: "A fire ends the first era", detail: "A fire destroyed the last brewery in the historic Brewer's Alley line. Frederick would go without a commercial brewery for most of the century that followed." },
    { year: "1996", title: "Brewer's Alley revives the name", detail: "Brewer's Alley opened as Frederick's first modern brewpub in the 1769 market house on North Market Street, reviving the old name and anchoring downtown's return to brewing." },
    { year: "2006", title: "The Flying Dog years", detail: "Flying Dog moved its production to Frederick and became one of Maryland's largest breweries, until it was sold and left for New York in 2023." },
    { year: "2012", title: "Farm breweries arrive", detail: "Milkhouse and Frey's brought farm brewing to the county, pouring in old barns on working farms in Mount Airy." },
    { year: "Today", title: "A beer destination", detail: "The Radius guide follows brewery brands from the Carroll Creek cluster to farm-country destinations in the hills. Frederick also hosts the Maryland Craft Beer Festival." },
  ],
  funFacts: [
    "Frederick's historic brewing district was literally called Brewer's Alley, and breweries ran there for about 153 years before the 1901 fire.",
    "The modern Brewer's Alley brewpub sits in a market house whose site dates to a 1765 town lottery.",
    "Frey's Brewing pours in a roughly 200-year-old bank barn on a working farm in Mount Airy.",
  ],
} as const;
