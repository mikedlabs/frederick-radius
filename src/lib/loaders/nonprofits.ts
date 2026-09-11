/**
 * nonprofits — the Frederick County nonprofit directory loader.
 *
 * Reads the server-only src/data/nonprofits.json (built by
 * scripts/build-nonprofits.mjs from the IRS Exempt Organizations Business
 * Master File). This is the "every registered nonprofit in the county" spine;
 * ProPublica hydrates the per-org financial detail on demand (see the org
 * page). Never imported client-side — the dataset is ~400KB.
 */
import "server-only";
import rawData from "@/data/nonprofits.json";
import {
  type NonprofitCategory,
  NONPROFIT_CATEGORIES,
} from "@/data/ntee-categories";

export type Nonprofit = {
  ein: string;
  name: string;
  street: string;
  city: string;
  zip: string;
  /** IRS subsection: "03" = 501(c)(3), "06" = business league, "13" = cemetery, etc. */
  subsection: string;
  ntee: string;
  category: NonprofitCategory;
  /** Four-digit year the IRS granted exemption (or ""). */
  ruling: string;
  /** Latest reported revenue / assets (0 when the org files a 990-N e-postcard). */
  revenue: number;
  assets: number;
  /** True for Mount Airy / Keymar orgs whose town straddles the county line. */
  border?: boolean;
};

const ALL = rawData as Nonprofit[];

export function allNonprofits(): Nonprofit[] {
  return ALL;
}

export function nonprofitByEin(ein: string): Nonprofit | undefined {
  const clean = ein.replace(/\D/g, "");
  return ALL.find((n) => n.ein === clean);
}

export function nonprofitsByCategory(category: NonprofitCategory): Nonprofit[] {
  return ALL.filter((n) => n.category === category);
}

/** Count per cause bucket, in the canonical display order, zero-buckets dropped. */
export function nonprofitCategoryCounts(): { category: NonprofitCategory; count: number }[] {
  const counts = new Map<NonprofitCategory, number>();
  for (const n of ALL) counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
  return NONPROFIT_CATEGORIES.map((c) => ({ category: c.slug, count: counts.get(c.slug) ?? 0 })).filter(
    (c) => c.count > 0,
  );
}

/** 501(c) subsection → short human label, for the org detail line. */
export function subsectionLabel(code: string): string {
  const map: Record<string, string> = {
    "03": "501(c)(3) charity",
    "04": "501(c)(4) civic league",
    "05": "501(c)(5) labor/ag",
    "06": "501(c)(6) business league",
    "07": "501(c)(7) social club",
    "08": "501(c)(8) fraternal",
    "10": "501(c)(10) fraternal",
    "13": "501(c)(13) cemetery",
    "19": "501(c)(19) veterans",
  };
  return map[code] ?? (code ? `501(c)(${Number(code)})` : "Tax-exempt org");
}
