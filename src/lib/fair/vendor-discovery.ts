import type { FairVendorProfile } from "@/data/fair/great-frederick-fair-2026-vendors";

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Search reviewed facts only. A match never implies a menu item is sold at the Fair. */
export function searchFairVendors(
  vendors: readonly FairVendorProfile[],
  query: string,
): FairVendorProfile[] {
  const normalized = normalize(query);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [...vendors];
  return vendors.map((vendor, index) => {
    const name = normalize(vendor.name);
    const aliases = vendor.searchAliases.map(normalize);
    const text = normalize([
      vendor.name, ...vendor.searchAliases, ...vendor.highlights,
      vendor.summary, vendor.booth.status === "known" ? vendor.booth.value : "",
    ].join(" "));
    const score = !tokens.every((token) => text.includes(token)) ? 0
      : name === normalized || aliases.includes(normalized) ? 4
        : name.includes(normalized) ? 3
          : aliases.some((alias) => alias.includes(normalized)) ? 2 : 1;
    return { vendor, score, index };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ vendor }) => vendor);
}
