/**
 * APPEND-ONLY merge of the hand-vetted, Google-enriched escape venues into the
 * place dataset. Unlike `build:discovered` (which rebuilds places-discovered
 * .json from scratch and re-slugs every row because it dedupes against the
 * prior enrichment keys — NOT idempotent), this script ONLY appends the new
 * records: it reads the existing discovered + enrichment + dfp, shapes each
 * curated add into the exact Place shape (same as build-discovered-places.ts),
 * dedupes its slug against everything already taken, and writes the two files
 * back with the additions only. Run `npm run build:client-places` after.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/append-curated-adds.ts <adds.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";

type Enriched = {
  google_place_id: string;
  name: string;
  address?: string;
  primary_type?: string;
  detail_primary_type?: string;
  lat: number;
  lng: number;
  municipality: string;
  business_status?: string;
  weekday_hours?: string[];
  has_hours?: boolean;
  rating?: number;
  user_rating_count?: number;
  photo_names?: string[];
  phone?: string;
  website?: string;
  editorial_summary?: string;
  review_snippet?: string;
  review_author?: string;
  discovered_for?: { category?: string };
};

const ADDS = process.argv[2] ?? "/tmp/frederick-final-adds.json";
const DISCOVERED = new URL("../src/data/places-discovered.json", import.meta.url).pathname;
const ENRICHMENT = new URL("../src/data/places-enrichment.json", import.meta.url).pathname;
const DFP = new URL("../src/data/places-dfp.json", import.meta.url).pathname;

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "")
    .trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60);
}
function stateFromAddress(addr?: string): string | null {
  const m = /,\s*([A-Z]{2})\s+\d{5}/.exec(addr ?? "");
  return m ? m[1] : null;
}
const SEARCH_CAT: Record<string, string> = {
  "coffee shop": "coffee", cafe: "coffee", restaurant: "restaurant",
  brewery: "brewery", distillery: "brewery", winery: "brewery", bar: "bar",
  bakery: "bakery", "ice cream shop": "restaurant", "farmers market": "market",
  museum: "museum", "art gallery": "gallery", "live music venue": "music",
  theater: "theater", park: "park", trail: "trail", playground: "playground",
  library: "library", bookstore: "book-store", "antique store": "antiques",
  "yoga studio": "yoga", gym: "wellness", hotel: "lodging", garden: "park",
  "place of worship": "worship",
};
function categoryOf(e: Enriched): string {
  return (
    categoryFromPrimaryType(e.detail_primary_type) ??
    categoryFromPrimaryType(e.primary_type) ??
    SEARCH_CAT[(e.discovered_for?.category ?? "").toLowerCase()] ??
    "services"
  );
}

function main() {
  const adds = JSON.parse(readFileSync(ADDS, "utf8")) as Enriched[];
  const discovered = JSON.parse(readFileSync(DISCOVERED, "utf8")) as Array<Record<string, unknown>>;
  const dfp = JSON.parse(readFileSync(DFP, "utf8")) as Array<{ slug: string }>;
  const enrichment = JSON.parse(readFileSync(ENRICHMENT, "utf8")) as Record<string, unknown>;

  // Everything already claiming a slug — never collide with it.
  const taken = new Set<string>();
  for (const p of discovered) taken.add(p.slug as string);
  for (const d of dfp) taken.add(d.slug);
  for (const k of Object.keys(enrichment)) taken.add(k);
  const existingPids = new Set(discovered.map((p) => p.google_place_id as string).filter(Boolean));

  const now = new Date().toISOString().slice(0, 10);
  let added = 0, skipped = 0;
  const byMuni: Record<string, number> = {};

  for (const e of adds) {
    if (!e.name || typeof e.lat !== "number" || typeof e.lng !== "number") { skipped++; continue; }
    if (e.google_place_id && existingPids.has(e.google_place_id)) { skipped++; continue; } // already in dataset
    const addrState = stateFromAddress(e.address);
    if (addrState && addrState !== "MD") { skipped++; continue; } // out-of-county border leak
    const muniName = MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? "Frederick County";
    let slug = `${slugify(e.name)}-${e.municipality}`;
    if (!slug || slug === `-${e.municipality}`) { skipped++; continue; }
    let n = 2;
    while (taken.has(slug)) slug = `${slugify(e.name)}-${e.municipality}-${n++}`;
    taken.add(slug);

    const category = categoryOf(e);
    const catName = CATEGORY_BY_SLUG[category]?.name ?? "Local spot";
    discovered.push({
      slug,
      name: e.name,
      category,
      short_blurb: e.editorial_summary?.trim() || `${catName} in ${muniName}.`,
      address: (e.address ?? "").replace(/, USA$/, ""),
      city: muniName,
      state: addrState ?? "MD",
      postal_code: "",
      municipality: e.municipality,
      geom: { lng: e.lng, lat: e.lat },
      website: e.website || undefined,
      phone: e.phone || undefined,
      google_place_id: e.google_place_id,
      feature_score: 5.0,
      updated_at: now,
    });
    enrichment[slug] = {
      business_status: e.business_status ?? "OPERATIONAL",
      weekday_hours: e.weekday_hours ?? [],
      has_hours: Boolean(e.has_hours),
      rating: e.rating,
      user_rating_count: e.user_rating_count,
      photo_names: (e.photo_names ?? []).slice(0, 8),
      phone: e.phone,
      website: e.website,
      lat: e.lat,
      lng: e.lng,
      primary_type: e.detail_primary_type ?? e.primary_type,
      editorial_summary: e.editorial_summary,
      enriched_at: new Date().toISOString(),
    };
    added++;
    byMuni[e.municipality] = (byMuni[e.municipality] ?? 0) + 1;
  }

  writeFileSync(DISCOVERED, JSON.stringify(discovered, null, 2));
  writeFileSync(ENRICHMENT, JSON.stringify(enrichment, null, 2));
  console.log(`\n  Appended ${added} curated places (${skipped} skipped). discovered now ${discovered.length}.`);
  console.log("  by town:", Object.entries(byMuni).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));
  console.log("  wrote places-discovered.json + places-enrichment.json (APPEND-only; existing slugs untouched).\n");
}

main();
