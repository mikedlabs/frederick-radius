/**
 * Ingest Phase 3 builder — turn discovered-enriched.json into
 * src/data/places-discovered.json (Place-shaped) + append Google
 * enrichment rows into places-enrichment.json, so the discovered
 * county places flow through the SAME loader spine (applyEnrichment,
 * relevance, dedupe, isOperational) as everything else.
 *
 * Pure/deterministic, no network. Provider editorial summaries stay in the
 * enrichment record for request-scoped, attributed Google context; they never
 * become permanent Radius blurbs. Slugs are collision-safe vs curated + DFP +
 * each other. Run AFTER Phase 2.
 *
 *   npm run build:discovered
 */
import { readFileSync, writeFileSync } from "node:fs";
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { resolveFrederickMunicipality } from "@/lib/location";
import { placementRejectionReason } from "@/lib/placement-trust";

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
const OUT_REJECTED = new URL("../src/data/discovered-build-placement-rejected.json", import.meta.url).pathname;

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "")
    .trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60);
}

// Pull the USPS state abbreviation from a "…, ST 12345" formatted address.
// Returns null when there's no state+ZIP signature — an in-county row we
// keep and stamp MD by default. Used to clip out-of-state results that
// the radius discovery pulls across the line at border towns.
function stateFromAddress(addr?: string): string | null {
  const m = /,\s*([A-Z]{2})\s+\d{5}/.exec(addr ?? "");
  return m ? m[1] : null;
}

// Discovery search terms → our taxonomy, the honest fallback when
// Google's primaryType is vague.
const SEARCH_CAT: Record<string, string> = {
  "coffee shop": "coffee", cafe: "coffee", restaurant: "restaurant",
  brewery: "brewery", distillery: "distillery", winery: "winery", bar: "bar",
  cidery: "winery", meadery: "winery",
  bakery: "bakery", "ice cream shop": "ice-cream", "farmers market": "market",
  museum: "museum", "art gallery": "gallery", "live music venue": "music",
  theater: "theater", park: "park", trail: "trail", playground: "playground",
  library: "library", bookstore: "book-store", "antique store": "antiques",
  "yoga studio": "yoga", gym: "yoga", hotel: "lodging", garden: "park",
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
  let skippedOutOfState = 0;
  const rejectedPlacement: Array<{
    reason: string;
    source_address: string;
    google_place_id: string;
    name: string;
    geom: { lng: number; lat: number };
    declared_municipality: string;
  }> = [];

  for (const e of enriched) {
    if (!e.name || typeof e.lat !== "number" || typeof e.lng !== "number") continue;
    // Boundary guard. Discovery searches a 6km radius around each
    // municipality centroid, so border towns (Brunswick on the Potomac,
    // Thurmont/Emmitsburg on the PA line) pull in places ACROSS the state
    // line — Lovettsville VA, Waynesboro PA, Harpers Ferry WV. Drop any
    // record whose address carries a non-MD state+ZIP so out-of-county
    // data never folds into a Frederick County, MD app. (Root-cause fix
    // for the out-of-state leak; previously state was hardcoded "MD",
    // which masked these.)
    const addrState = stateFromAddress(e.address);
    if (addrState && addrState !== "MD") { skippedOutOfState++; continue; }
    const reason = placementRejectionReason({ lng: e.lng, lat: e.lat });
    const municipality = reason
      ? null
      : resolveFrederickMunicipality({ lng: e.lng, lat: e.lat });
    if (reason || !municipality) {
      rejectedPlacement.push({
        reason: reason ?? "outside-county-area",
        source_address: e.address ?? "",
        google_place_id: e.google_place_id,
        name: e.name,
        geom: { lng: e.lng, lat: e.lat },
        declared_municipality: e.municipality,
      });
      continue;
    }
    const municipalitySlug = municipality.municipality.slug;
    const muniName =
      MUNICIPALITY_BY_SLUG[municipalitySlug]?.name ?? "Frederick County";
    let slug = `${slugify(e.name)}-${municipalitySlug}`;
    if (!slug || slug === `-${municipalitySlug}`) continue;
    let n = 2;
    while (taken.has(slug)) slug = `${slugify(e.name)}-${municipalitySlug}-${n++}`;
    taken.add(slug);

    const category = categoryOf(e);
    places.push({
      slug,
      name: e.name,
      category,
      // Google editorial summaries are provider content. They remain in the
      // enrichment row below so the live Google context component can fetch
      // and credit them; the permanent Radius description starts empty until
      // an approved, source-backed description is available.
      short_blurb: "",
      address: (e.address ?? "").replace(/, USA$/, ""),
      city: muniName,
      state: addrState ?? "MD",
      postal_code: "",
      municipality: municipalitySlug,
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
  writeFileSync(
    OUT_REJECTED,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: "discovered-enriched.json",
        count: rejectedPlacement.length,
        rows: rejectedPlacement,
      },
      null,
      2,
    ),
  );

  const byMuni: Record<string, number> = {};
  for (const p of places) byMuni[p.municipality as string] = (byMuni[p.municipality as string] ?? 0) + 1;
  console.log(`\n  Built ${places.length} discovered Place records.`);
  if (skippedOutOfState > 0)
    console.log(`  Skipped ${skippedOutOfState} out-of-state record(s) at the MD boundary guard.`);
  if (rejectedPlacement.length > 0)
    console.log(`  Retained ${rejectedPlacement.length} county-placement rejection(s) for review.`);
  console.log("  by town:", Object.entries(byMuni).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));
  console.log("  wrote src/data/places-discovered.json + appended places-enrichment.json\n");
}

main();
