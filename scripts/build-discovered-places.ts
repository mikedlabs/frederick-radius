/**
 * Ingest Phase 3 builder — turn discovered-enriched.json into
 * src/data/places-discovered.json (Place-shaped) + append Google
 * enrichment rows into places-enrichment.json, so the discovered
 * county places flow through the SAME loader spine (applyEnrichment,
 * relevance, dedupe, isOperational) as everything else.
 *
 * Pure/deterministic, no network. Honesty: short_blurb is a factual
 * "<Category> in <Town>" — never invented marketing copy. Slugs are
 * collision-safe vs curated + DFP + each other. Run AFTER Phase 2.
 *
 *   npm run build:discovered
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

const ENRICHED = new URL("../src/data/discovered-enriched.json", import.meta.url).pathname;
const ENRICHMENT = new URL("../src/data/places-enrichment.json", import.meta.url).pathname;
const DFP = new URL("../src/data/places-dfp.json", import.meta.url).pathname;
const OUT_PLACES = new URL("../src/data/places-discovered.json", import.meta.url).pathname;

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "")
    .trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60);
}

// Discovery search terms → our taxonomy, the honest fallback when
// Google's primaryType is vague.
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
  const enriched = JSON.parse(readFileSync(ENRICHED, "utf8")) as Enriched[];
  const dfp = JSON.parse(readFileSync(DFP, "utf8")) as Array<{ slug: string }>;
  const enrichment = JSON.parse(readFileSync(ENRICHMENT, "utf8")) as Record<string, unknown>;

  const taken = new Set<string>(dfp.map((d) => d.slug));
  for (const k of Object.keys(enrichment)) taken.add(k);

  const places: Record<string, unknown>[] = [];
  const now = new Date().toISOString().slice(0, 10);

  for (const e of enriched) {
    if (!e.name || typeof e.lat !== "number" || typeof e.lng !== "number") continue;
    const muniName = MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? "Frederick County";
    let slug = `${slugify(e.name)}-${e.municipality}`;
    if (!slug || slug === `-${e.municipality}`) continue;
    let n = 2;
    while (taken.has(slug)) slug = `${slugify(e.name)}-${e.municipality}-${n++}`;
    taken.add(slug);

    const category = categoryOf(e);
    const catName = CATEGORY_BY_SLUG[category]?.name ?? "Local spot";

    places.push({
      slug,
      name: e.name,
      category,
      // Google's real one-liner when it exists; factual fallback
      // otherwise (never invented marketing copy).
      short_blurb: e.editorial_summary?.trim() || `${catName} in ${muniName}.`,
      address: (e.address ?? "").replace(/, USA$/, ""),
      city: muniName,
      state: "MD",
      postal_code: "",
      municipality: e.municipality,
      geom: { lng: e.lng, lat: e.lat },
      website: e.website || undefined,
      phone: e.phone || undefined,
      google_place_id: e.google_place_id,
      feature_score: 5.0, // baseline; below curated/marquee
      updated_at: now,
    });

    // Enrichment overlay row (keyed by slug) — same shape the loader
    // already consumes, so hours/photos/rating/category-correction +
    // the closed-status + geom guard all apply uniformly.
    enrichment[slug] = {
      business_status: e.business_status ?? "UNKNOWN",
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
      review_snippet: e.review_snippet,
      review_author: e.review_author,
      enriched_at: new Date().toISOString(),
    };
  }

  writeFileSync(OUT_PLACES, JSON.stringify(places, null, 2));
  writeFileSync(ENRICHMENT, JSON.stringify(enrichment, null, 2));

  const byMuni: Record<string, number> = {};
  for (const p of places) byMuni[p.municipality as string] = (byMuni[p.municipality as string] ?? 0) + 1;
  console.log(`\n  Built ${places.length} discovered Place records.`);
  console.log("  by town:", Object.entries(byMuni).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));
  console.log("  wrote src/data/places-discovered.json + appended places-enrichment.json\n");
}

main();
