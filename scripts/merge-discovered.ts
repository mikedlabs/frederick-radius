/**
 * Phase 3 — merge approved discovered candidates into the canonical
 * Place shape.
 *
 * Reads:
 *   - src/data/discovered-enriched.json   (1,060 enriched candidates)
 *   - data/discovered-decisions.json      (editor approvals via /admin/discovered-review)
 *
 * Emits:
 *   - src/data/places-discovered.json      (Place records ready to fold in)
 *   - src/data/places-discovered-enrichment.json
 *       (additions to places-enrichment.json keyed by slug, so the
 *        existing decorator can attach photos + rating + hours)
 *
 * Does NOT mutate places.ts or places-enrichment.json — those are
 * canonical, hand-curated. The owner reviews the emitted files then
 * commits the merge themselves, same discipline as `npm run dedup`
 * and the Phase-2 enrichment artifacts.
 *
 *   npm run merge:discovered
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getApprovedIds } from "@/lib/discovered-review";
import { closeDb } from "@/lib/db/client";

type Enriched = {
  google_place_id: string;
  name: string;
  address?: string;
  primary_type?: string;
  detail_primary_type?: string;
  municipality: string;
  lat: number;
  lng: number;
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
  discovered_for?: { category: string; area: string };
};

const ENRICHED = path.join(process.cwd(), "src/data/discovered-enriched.json");
const OUT_PLACES = path.join(process.cwd(), "src/data/places-discovered.json");
const OUT_ENRICHMENT = path.join(process.cwd(), "src/data/places-discovered-enrichment.json");

/** Map Google primary_type → our internal category slug. The list is
 *  conservative: types we don't have a clean mapping for fall back
 *  to "services" so the place still ships but in a generic bucket
 *  that the editor can refine later. */
const TYPE_TO_CATEGORY: Record<string, string> = {
  coffee_shop: "coffee",
  cafe: "coffee",
  restaurant: "restaurant",
  bar: "bar",
  pub: "bar",
  bakery: "bakery",
  brewery: "brewery",
  distillery: "brewery",
  winery: "brewery",
  ice_cream_shop: "bakery",
  meal_takeaway: "restaurant",
  meal_delivery: "restaurant",
  pizza_restaurant: "pizza",
  food_court: "restaurant",
  museum: "museum",
  art_gallery: "gallery",
  performing_arts_theater: "theater",
  movie_theater: "theater",
  live_music_venue: "music",
  park: "park",
  hiking_area: "trail",
  national_park: "park",
  state_park: "park",
  playground: "playground",
  library: "library",
  book_store: "book-store",
  antique_store: "antiques",
  yoga_studio: "yoga",
  gym: "wellness",
  lodging: "lodging",
  hotel: "lodging",
  bed_and_breakfast: "lodging",
  motel: "lodging",
  campground: "lodging",
  garden: "park",
  place_of_worship: "worship",
  church: "worship",
  parking: "parking",
  pharmacy: "pharmacy",
  hardware_store: "hardware",
  local_government_office: "government",
  post_office: "civic",
  police: "public-safety",
  fire_station: "public-safety",
  bus_station: "transit",
  train_station: "transit",
};

function slugify(name: string, placeId: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  // The first 6 chars of the place_id are an opaque dedupe suffix —
  // they keep two different "Frederick Coffee Co" entries distinct
  // without forcing the editor to invent names.
  const suffix = placeId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase();
  return base ? `${base}-${suffix}` : `place-${suffix}`;
}

function parseAddress(addr?: string): {
  street: string;
  city: string;
  postal: string;
} {
  if (!addr) return { street: "", city: "Frederick", postal: "21701" };
  // Pattern: "100 N East St, Frederick, MD 21701, USA"
  const parts = addr.split(",").map((s) => s.trim());
  const street = parts[0] ?? "";
  const city = parts[1] ?? "Frederick";
  const stateZip = parts[2] ?? "";
  const postal = stateZip.match(/\d{5}/)?.[0] ?? "21701";
  return { street, city, postal };
}

function blurbFromEditorial(e: Enriched): string {
  if (e.editorial_summary && e.editorial_summary.length >= 25) {
    return e.editorial_summary.slice(0, 320);
  }
  // Fallback: a category-aware one-liner. Honest about being a
  // placeholder so the editor knows to rewrite.
  const cat = TYPE_TO_CATEGORY[e.detail_primary_type ?? ""] ??
    TYPE_TO_CATEGORY[e.primary_type ?? ""] ?? "place";
  return `A ${cat.replace("-", " ")} in ${e.municipality}. Description not yet written.`;
}

async function main() {
  const enriched = JSON.parse(readFileSync(ENRICHED, "utf8")) as Enriched[];
  // Decisions now live in the curation_decisions table (DB-backed so the owner
  // can triage from prod/phone), not a local JSON file.
  const approvedIds = await getApprovedIds();

  if (approvedIds.length === 0) {
    console.log("\n  No approved candidates in the curation_decisions table.");
    console.log("  Open /admin/discovered-review to triage first.\n");
    return;
  }

  const byId = new Map(enriched.map((e) => [e.google_place_id, e]));
  const places: Record<string, unknown>[] = [];
  const enrichment: Record<string, Record<string, unknown>> = {};

  for (const id of approvedIds) {
    const e = byId.get(id);
    if (!e) continue;
    const cat =
      TYPE_TO_CATEGORY[e.detail_primary_type ?? ""] ??
      TYPE_TO_CATEGORY[e.primary_type ?? ""] ??
      "services";
    const slug = slugify(e.name, e.google_place_id);
    const addr = parseAddress(e.address);
    places.push({
      slug,
      name: e.name,
      category: cat,
      short_blurb: blurbFromEditorial(e),
      address: addr.street,
      city: addr.city,
      state: "MD",
      postal_code: addr.postal,
      municipality: e.municipality,
      geom: { lng: e.lng, lat: e.lat },
      phone: e.phone,
      website: e.website,
      is_verified: e.business_status === "OPERATIONAL",
      is_operational:
        e.business_status === "CLOSED_PERMANENTLY"
          ? "closed_permanently"
          : e.business_status === "CLOSED_TEMPORARILY"
            ? "closed_temporarily"
            : "operational",
      feature_score: 5,
      source: "google",
      updated_at: new Date().toISOString(),
      google_place_id: e.google_place_id,
    });
    enrichment[slug] = {
      google_place_id: e.google_place_id,
      business_status: e.business_status,
      display_name: e.name,
      formatted_address: e.address,
      weekday_hours: e.weekday_hours,
      has_hours: e.has_hours,
      rating: e.rating,
      user_rating_count: e.user_rating_count,
      photo_names: e.photo_names,
      phone: e.phone,
      website: e.website,
      primary_type: e.detail_primary_type ?? e.primary_type,
      editorial_summary: e.editorial_summary,
      review_snippet: e.review_snippet,
      review_author: e.review_author,
      lat: e.lat,
      lng: e.lng,
    };
  }

  writeFileSync(OUT_PLACES, JSON.stringify(places, null, 2));
  writeFileSync(OUT_ENRICHMENT, JSON.stringify(enrichment, null, 2));

  console.log(`\n  Wrote ${places.length} Place records to ${OUT_PLACES}`);
  console.log(`  Wrote ${Object.keys(enrichment).length} enrichment rows to ${OUT_ENRICHMENT}`);
  console.log("  Inspect the files, then merge into places.ts + places-enrichment.json by hand.");
  console.log("  Nothing in src/data/places.ts was changed.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
