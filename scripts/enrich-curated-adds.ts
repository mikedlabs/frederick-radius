/**
 * Targeted Google Places enrichment for a hand-vetted list of net-new places
 * (the June-2026 escape-discovery survivors). For each {name, town} it runs
 * ONE rich Text Search (Places API New) biased to the town centroid, validates
 * the result is the SAME business (name-token overlap) and inside Frederick
 * County (bbox), and emits an `Enriched`-shaped record — the exact shape
 * scripts/build-discovered-places.ts already consumes. It writes a REVIEW file
 * only (never mutates src/data); the owner reviews, then we append the good
 * rows to discovered-enriched.json and run the normal build.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json \
 *     scripts/enrich-curated-adds.ts <in.json> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { MUNICIPALITIES } from "@/data/municipalities";
import { resolveFrederickMunicipality } from "@/lib/location";

const KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!KEY) {
  console.error("GOOGLE_PLACES_API_KEY not set — aborting, $0 spent.");
  process.exit(1);
}

const IN = process.argv[2] ?? "/tmp/frederick-trulynew.json";
const OUT = process.argv[3] ?? "/tmp/frederick-enriched.json";

type Cand = { name: string; town: string; category: string; blurb?: string; website?: string; address?: string };
const cands = JSON.parse(readFileSync(IN, "utf8")) as Cand[];

const MUNI = new Map<string, { lat: number; lng: number }>();
for (const m of MUNICIPALITIES as Array<{ slug: string; centroid: { lat: number; lng: number } }>) {
  MUNI.set(m.slug, { lat: m.centroid.lat, lng: m.centroid.lng });
}
const COUNTY_CENTER = { lat: 39.4143, lng: -77.4105 };
const slugifyTown = (t: string) =>
  (t || "").toLowerCase().trim().replace(/^mt\b/, "mount").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function muniFor(town: string): { slug: string; center: { lat: number; lng: number } } {
  const s = slugifyTown(town);
  const m = MUNI.get(s);
  return { slug: s, center: m ?? COUNTY_CENTER };
}

const SEARCH_CAT: Record<string, string> = {
  restaurant: "restaurant", bar: "bar", brewery: "brewery", distillery: "distillery",
  winery: "winery", cidery: "winery", cafe: "cafe", bakery: "bakery", dessert: "ice cream shop",
  lodging: "hotel", museum: "museum", gallery: "art gallery", park: "park", trail: "trail",
  outdoor: "trail", farm: "farmers market", shop: "antique store",
};

const tokens = (s: string) => new Set((s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
function overlap(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / A.size;
}
const MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.location",
  "places.primaryType", "places.types", "places.rating", "places.userRatingCount",
  "places.regularOpeningHours", "places.websiteUri", "places.nationalPhoneNumber",
  "places.businessStatus", "places.editorialSummary", "places.photos",
].join(",");

type GPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  editorialSummary?: { text?: string };
  photos?: { name?: string }[];
};

async function search(c: Cand): Promise<GPlace | null> {
  const { center } = muniFor(c.town);
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY!,
      "X-Goog-FieldMask": MASK,
    },
    body: JSON.stringify({
      textQuery: `${c.name}, ${c.town}, MD`,
      maxResultCount: 1,
      locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 12000 } },
    }),
  });
  if (!res.ok) {
    console.error(`  HTTP ${res.status} for "${c.name}"`);
    return null;
  }
  const data = (await res.json()) as { places?: GPlace[] };
  return data.places?.[0] ?? null;
}

async function main() {
  const enriched: Record<string, unknown>[] = [];
  const weak: string[] = [];
  const failed: string[] = [];
  let calls = 0;

  for (const c of cands) {
    const p = await search(c).catch(() => null);
    calls++;
    if (!p || !p.displayName?.text || !p.location?.latitude || !p.location?.longitude) {
      failed.push(`${c.name} (${c.town}) — no result`);
      continue;
    }
    const lat = p.location.latitude!, lng = p.location.longitude!;
    const sim = Math.max(overlap(c.name, p.displayName.text), overlap(p.displayName.text, c.name));
    // A search result receives no Frederick municipality until its returned
    // point clears the real county outline. Never trust the town in the query
    // as proof that Google matched the intended county.
    const countyMunicipality = resolveFrederickMunicipality({ lng, lat });
    if (!countyMunicipality) { failed.push(`${c.name} → "${p.displayName.text}" OUT OF COUNTY (${lat.toFixed(3)},${lng.toFixed(3)})`); continue; }
    if (sim < 0.45) { weak.push(`${c.name} → matched "${p.displayName.text}" (sim ${sim.toFixed(2)})`); }

    const muni = countyMunicipality.municipality.slug;
    enriched.push({
      google_place_id: p.id,
      name: p.displayName.text,
      address: p.formattedAddress,
      primary_type: p.primaryType ?? p.types?.[0],
      detail_primary_type: p.primaryType,
      lat, lng,
      municipality: muni,
      business_status: p.businessStatus ?? "OPERATIONAL",
      weekday_hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
      has_hours: Boolean(p.regularOpeningHours?.weekdayDescriptions?.length),
      rating: p.rating,
      user_rating_count: p.userRatingCount,
      photo_names: (p.photos ?? []).map((ph) => ph.name).filter(Boolean).slice(0, 8),
      phone: p.nationalPhoneNumber,
      website: p.websiteUri || c.website,
      editorial_summary: p.editorialSummary?.text,
      discovered_for: { category: SEARCH_CAT[c.category] ?? c.category },
      _query_name: c.name,
      _name_sim: Number(sim.toFixed(2)),
    });
  }

  writeFileSync(OUT, JSON.stringify(enriched, null, 2));
  console.log(`\n  Text Search calls: ${calls}`);
  console.log(`  Enriched + in-county: ${enriched.length}`);
  console.log(`  Weak name matches (review): ${weak.length}`);
  weak.forEach((w) => console.log("    ? " + w));
  console.log(`  Failed / out-of-county (dropped): ${failed.length}`);
  failed.forEach((f) => console.log("    x " + f));
  console.log(`\n  Wrote ${enriched.length} review rows to ${OUT}. No src/data mutated.\n`);
}

main();
