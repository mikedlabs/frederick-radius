import type { AppPage } from "@/data/app-pages";
import { greatFrederickFair2026Vendors } from "@/data/fair/great-frederick-fair-2026-vendors";

const FAIR_PATH = "/moments/great-frederick-fair-2026";

// The vendor browser also accepts food/category aliases. Those are useful
// inside the Fair, but are not evidence that a countywide pizza query named
// this exhibitor. Only reviewed brand variants belong in this narrow index.
const BRAND_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "vendor-white-rabbit-rad-pies": ["White Rabbit", "White Rabbit Gastropub", "Rad Pies", "RadPies"],
  "vendor-jb-seafood": ["J B Seafood"],
};

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function containsName(text: string, name: string): boolean {
  return ` ${normalize(text)} `.includes(` ${normalize(name)} `);
}

export type NamedFairVendorMatch = {
  page: AppPage;
  matchedNames: string[];
  explicitFair: boolean;
};

/** A dated guide result, never a permanent place or a claim of current hours. */
export function namedFairVendorMatches(query: string, municipality?: string | null): NamedFairVendorMatch[] {
  if (municipality && municipality !== "frederick") return [];
  if (/\b20\d{2}\b/.test(query) && !/\b2026\b/.test(query)) return [];
  const explicitFair = /\bfair(?:grounds)?\b/i.test(query);
  return greatFrederickFair2026Vendors.flatMap((vendor) => {
    const names = [vendor.name, ...(BRAND_ALIASES[vendor.id] ?? [])];
    const matchedNames = names.filter((name) => containsName(query, name));
    if (!matchedNames.length) return [];
    const booth = vendor.booth.status === "known" ? ` Booth reference: ${vendor.booth.value}.` : "";
    return [{
      page: {
        href: `${FAIR_PATH}?vendor=${encodeURIComponent(vendor.id)}#fair-map`,
        title: `${vendor.name} at the 2026 Fair`,
        blurb: `This is a Fair vendor listing at Frederick Fairgrounds, not a permanent business location.${booth} Vendor hours are not confirmed.`,
        keywords: names,
      },
      matchedNames,
      explicitFair,
    }];
  });
}

/** Keep a real named restaurant distinct from its temporary Fair presence. */
export function isNamedFairVendorPlace(name: string, matches: readonly NamedFairVendorMatch[]): boolean {
  return matches.some((match) => match.matchedNames.some((alias) => containsName(name, alias)));
}
