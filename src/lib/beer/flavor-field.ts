import {
  ALL_BEERS,
  STYLE_FAMILIES,
  type StyleFamily,
  type BeerWithBrewery,
} from "@/data/beers";

/**
 * The Flavor Field — the layout math for /beer's signature chart, where all
 * 174 signature pours plot as dots on family rows across an ABV axis, and the
 * chart IS the filter control for the board beneath it.
 *
 * Pure + SSR-stable: dot positions are deterministic (a hash of the beer key,
 * never Math.random), so the server and client render the identical field and
 * hydration never shifts a dot. The React layer (FlavorField.tsx) owns only
 * paint + interaction; every number here is derived from our own data.
 */

/** ABV axis bounds. The real data spans 3.3–12.2%; a hair of padding on each
 *  end keeps the extreme dots off the very edge. */
export const ABV_MIN = 3.0;
export const ABV_MAX = 12.5;

/** Fraction [0,1] along the ABV axis for a given ABV (clamped to the scale). */
export function abvFraction(abv: number): number {
  const clamped = Math.max(ABV_MIN, Math.min(ABV_MAX, abv));
  return (clamped - ABV_MIN) / (ABV_MAX - ABV_MIN);
}

export type FieldDot = {
  /** Stable beer key (brewerySlug::name). */
  key: string;
  /** 0..1 along the ABV axis (x). */
  xFrac: number;
  /** 0..1 within the row band (deterministic beeswarm y). */
  yFrac: number;
  flagship: boolean;
  /** Untappd 4.0+ — renders in the family's deep tone. */
  wellRated: boolean;
};

export type FieldRow = {
  key: StyleFamily;
  label: string;
  base: string;
  deep: string;
  count: number;
  dots: FieldDot[];
};

/** FNV-1a → [0,1). Deterministic so the beeswarm is identical every render. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * The nine family rows, sorted by count descending (IPA leads at 56, specialty
 * trails at 5). Each row carries its dots, positioned by ABV on x and a
 * deterministic jitter on y so overlapping strengths don't stack into one blob.
 */
export function buildFieldRows(beers: BeerWithBrewery[] = ALL_BEERS): FieldRow[] {
  const byFamily = new Map<StyleFamily, BeerWithBrewery[]>();
  for (const beer of beers) {
    const arr = byFamily.get(beer.family) ?? [];
    arr.push(beer);
    byFamily.set(beer.family, arr);
  }
  const rows = STYLE_FAMILIES.map((family) => {
    const list = byFamily.get(family.key) ?? [];
    const dots: FieldDot[] = list
      .filter((b) => b.abv != null)
      .map((b) => ({
        key: `${b.brewerySlug}::${b.name}`,
        xFrac: abvFraction(b.abv as number),
        yFrac: hash01(`${b.brewerySlug}${b.name}`),
        flagship: b.flagship,
        wellRated: (b.rating ?? 0) >= 4.0,
      }));
    return {
      key: family.key,
      label: family.label,
      base: family.base,
      deep: family.deep,
      count: list.length,
      dots,
    };
  });
  // Count desc; key breaks ties so the three 10-count families keep a stable order.
  return rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** ABV bands a drinker thinks in, aligned to the axis (shared with the board). */
export const FIELD_ABV_BANDS: {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
}[] = [
  { key: "session", label: "Under 5%", min: null, max: 4.99 },
  { key: "standard", label: "5 to 7%", min: 5, max: 7 },
  { key: "strong", label: "7% and up", min: 7, max: null },
];

export type FlavorInsight = {
  id: string;
  text: string;
  /** The filter this insight applies when tapped. */
  apply: { families?: StyleFamily[]; minAbv?: number | null; maxAbv?: number | null };
};

/**
 * Three TRUE, data-derived insights that also act as one-tap filters. The
 * numbers here are asserted against the live data in flavor-field.spec.ts, so
 * a data refresh that moves them fails the build instead of silently lying.
 */
export const FLAVOR_INSIGHTS: FlavorInsight[] = [
  {
    id: "ipa",
    text: "One in three of the county's signature beers is an IPA, 56 of 174.",
    apply: { families: ["ipa"] },
  },
  {
    id: "strong",
    text: "Two breweries own the strong end: Steinhardt and Midnight Run pour 16 of the 40 beers at 8% or higher.",
    apply: { minAbv: 8, maxAbv: null },
  },
  {
    id: "sour",
    text: "The smallest shelf is the best rated: 10 sours average 3.87 on Untappd, and the county's top beer is a sour, Drunken Pineapple Upside-Down Cake at 4.34.",
    apply: { families: ["sour-wild"] },
  },
];
