import "server-only";
import CLIENT_RAW from "@/data/places-client.json" with { type: "json" };
import FIELD_NOTES_RAW from "@/data/field-notes.json" with { type: "json" };
import NONPROFITS_RAW from "@/data/nonprofits.json" with { type: "json" };
import FARMERS_RAW from "@/data/farmers-markets.json" with { type: "json" };
import SHIPPING_RAW from "@/data/shipping.json" with { type: "json" };
import { BREWERIES } from "@/data/beers";
import { MUNICIPALITIES } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";

/**
 * The county in numbers — every figure computed from the SHIPPED datasets,
 * nothing typed in by hand, so the almanac can never drift from the app it
 * describes. Pure reads over committed JSON; recomputes on deploy.
 */

type PlaceRow = {
  category: string;
  municipality: string;
  hours?: unknown;
  hours_verified?: boolean;
  google_rating?: number;
};

const PLACES = CLIENT_RAW as unknown as PlaceRow[];

export type LeaderRow = { label: string; count: number; href?: string };

export type CountyNumbers = {
  catalog: {
    places: number;
    towns: number;
    verifiedHours: number;
    rated: number;
    fourEightPlus: number;
  };
  perTown: LeaderRow[];
  topCategories: LeaderRow[];
  beer: {
    beers: number;
    breweries: number;
    strongestAbv: number;
    lightestAbv: number;
    medianAbv: number;
    families: LeaderRow[];
    topRated: { name: string; brewery: string; rating: number } | null;
  };
  fieldwork: {
    notedPlaces: number;
    happyHours: number;
    parkingTips: number;
    insiderNotes: number;
  };
  county: {
    nonprofits: number;
    farmersMarkets: number;
    shippingPoints: number;
    oldestTown: { name: string; est: number } | null;
    townsPopulation: number;
  };
};

const FAMILY_LABEL: Record<string, string> = {
  ipa: "IPAs",
  "stout-porter": "Stouts & porters",
  "lager-pilsner": "Lagers & pilsners",
  "belgian-farmhouse": "Belgians & farmhouse",
  "wheat-hazy": "Wheat & hazy",
  "pale-ale": "Pale ales",
  "sour-wild": "Sours & wilds",
  "amber-brown": "Ambers & browns",
  "specialty-other": "Specialty & other",
};

export function computeCountyNumbers(): CountyNumbers {
  const perTownMap = new Map<string, number>();
  const perCatMap = new Map<string, number>();
  let verifiedHours = 0;
  let rated = 0;
  let fourEightPlus = 0;
  for (const p of PLACES) {
    perTownMap.set(p.municipality, (perTownMap.get(p.municipality) ?? 0) + 1);
    perCatMap.set(p.category, (perCatMap.get(p.category) ?? 0) + 1);
    if (p.hours && p.hours_verified !== false) verifiedHours++;
    if (p.google_rating) {
      rated++;
      if (p.google_rating >= 4.8) fourEightPlus++;
    }
  }
  const muniName = (slug: string) =>
    MUNICIPALITIES.find((m) => m.slug === slug)?.name ?? slug.replace(/-/g, " ");

  const perTown: LeaderRow[] = [...perTownMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([slug, count]) => ({ label: muniName(slug), count, href: `/m/${slug}` }));

  const topCategories: LeaderRow[] = [...perCatMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([slug, count]) => ({
      label: CATEGORY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " "),
      count,
      href: `/category/${slug}`,
    }));

  // ── Beer ──
  const beers = BREWERIES.flatMap((b) => b.beers.map((x) => ({ ...x, brewery: b.name })));
  const famMap = new Map<string, number>();
  for (const b of beers) famMap.set(b.family, (famMap.get(b.family) ?? 0) + 1);
  const abvs = beers.map((b) => b.abv).filter((v): v is number => v != null).sort((a, b) => a - b);
  const ratedBeers = beers.filter((b) => b.rating != null);
  const top = ratedBeers.sort((a, b) => (b.rating as number) - (a.rating as number))[0] ?? null;

  // ── Fieldwork (the hand-verified moat) ──
  const notes = Object.values(FIELD_NOTES_RAW as Record<string, { happy_hour?: unknown; parking?: unknown; insider?: unknown[] }>);

  // ── County ledger ──
  const oldest = [...MUNICIPALITIES].filter((m) => m.est).sort((a, b) => a.est - b.est)[0] ?? null;

  return {
    catalog: {
      places: PLACES.length,
      towns: perTownMap.size,
      verifiedHours,
      rated,
      fourEightPlus,
    },
    perTown,
    topCategories,
    beer: {
      beers: beers.length,
      breweries: BREWERIES.length,
      strongestAbv: abvs[abvs.length - 1] ?? 0,
      lightestAbv: abvs[0] ?? 0,
      medianAbv: abvs[Math.floor(abvs.length / 2)] ?? 0,
      families: [...famMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([slug, count]) => ({ label: FAMILY_LABEL[slug] ?? slug, count })),
      topRated: top ? { name: top.name, brewery: top.brewery, rating: top.rating as number } : null,
    },
    fieldwork: {
      notedPlaces: notes.length,
      happyHours: notes.filter((n) => n.happy_hour).length,
      parkingTips: notes.filter((n) => n.parking).length,
      insiderNotes: notes.filter((n) => Array.isArray(n.insider) && n.insider.length > 0).length,
    },
    county: {
      nonprofits: (NONPROFITS_RAW as unknown[]).length,
      farmersMarkets: (FARMERS_RAW as unknown[]).length,
      shippingPoints: (SHIPPING_RAW as unknown[]).length,
      oldestTown: oldest ? { name: oldest.name, est: oldest.est } : null,
      townsPopulation: MUNICIPALITIES.reduce((n, m) => n + (m.population ?? 0), 0),
    },
  };
}
