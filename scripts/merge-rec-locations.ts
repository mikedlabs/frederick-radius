/**
 * Fold the county Parks & Rec amenity locations (rec-locations.json) into
 * the place set — DRY RUN by design. Produces a reviewable plan
 * (src/data/rec-merge-plan.json) + a console report; does NOT mutate
 * places-client.json. Apply is a separate, owner-reviewed step.
 *
 *   npm run merge:rec   # (tsx scripts/merge-rec-locations.ts)
 *
 * The model, honest to "answers, not a directory":
 *   - Destination kinds (park · playground · trail) become/enrich PLACE
 *     records. We dedupe against the live set by normalized name +
 *     proximity, so we never double-list a park we already have.
 *       · matched   → enrichment (attach the verified GIS photo; flag a
 *                     coordinate conflict when our pin is >400m off — the
 *                     Ballenger Creek mis-geocode class).
 *       · unmatched → a NEW place record (build-discovered shape; source
 *                     "fc-gis", Verified tier), but only after the point
 *                     clears the county boundary; municipality resolves next.
 *   - Amenity kinds (shelter · field · facility) are NOT place cards.
 *     They roll UP onto their parent park as counts + facts, keyed by the
 *     feature's `park` field.
 *   - Passport markers stay separate (they power the passport feature,
 *     not the directory).
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { RecLocation } from "@/lib/integrations/fcRecLocations";
import { resolveFrederickMunicipality } from "@/lib/location";

const REC = new URL("../src/data/rec-locations.json", import.meta.url).pathname;
const CLIENT = new URL("../src/data/places-client.json", import.meta.url).pathname;
const OUT = new URL("../src/data/rec-merge-plan.json", import.meta.url).pathname;

type Place = {
  slug: string; name: string; category: string; municipality: string;
  geom: { lng: number; lat: number }; google_photo_url?: string;
};

const DEST_KIND_TO_CATEGORY: Record<string, string> = {
  park: "park", playground: "playground", trail: "trail",
};

const norm = (s: string) =>
  s.toLowerCase().replace(/\b(park|trail|playground|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}

function main() {
  const recs = JSON.parse(readFileSync(REC, "utf8")) as RecLocation[];
  const places = JSON.parse(readFileSync(CLIENT, "utf8")) as Place[];

  // index existing destination places for matching
  const destPlaces = places.filter((p) => ["park", "playground", "trail"].includes(p.category));

  const enrich: { slug: string; name: string; addPhoto?: string; coordConflictMeters?: number }[] = [];
  const newPlaces: Record<string, unknown>[] = [];
  const rejectedPlacement: Array<{
    objectId: string | number;
    name: string;
    lat: number;
    lng: number;
    reason: "outside-county-area";
  }> = [];
  const taken = new Set(places.map((p) => p.slug));
  const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "")
    .trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60);

  let matched = 0, created = 0, conflicts = 0;
  const destRecs = recs.filter((r) => DEST_KIND_TO_CATEGORY[r.kind]);
  for (const r of destRecs) {
    const rn = norm(r.name);
    // best candidate: normalized-name match (equality or containment), nearest wins
    let best: Place | null = null, bestD = Infinity;
    for (const p of destPlaces) {
      const pn = norm(p.name);
      const nameHit = pn === rn || (rn && pn && (pn.includes(rn) || rn.includes(pn)));
      if (!nameHit) continue;
      const d = haversine(r, p.geom);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      matched++;
      const e: typeof enrich[number] = { slug: best.slug, name: best.name };
      if (!best.google_photo_url && r.photoUrl) e.addPhoto = r.photoUrl;
      if (bestD > 400) { e.coordConflictMeters = Math.round(bestD); conflicts++; }
      if (e.addPhoto || e.coordConflictMeters) enrich.push(e);
    } else {
      const municipality = resolveFrederickMunicipality({
        lat: r.lat,
        lng: r.lng,
      });
      if (!municipality) {
        rejectedPlacement.push({
          objectId: r.objectId,
          name: r.name,
          lat: r.lat,
          lng: r.lng,
          reason: "outside-county-area",
        });
        continue;
      }
      created++;
      const muni = municipality.municipality.slug;
      let slug = `${slugify(r.name)}-${muni}`; let n = 2;
      while (taken.has(slug)) slug = `${slugify(r.name)}-${muni}-${n++}`;
      taken.add(slug);
      newPlaces.push({
        slug, name: r.name, category: DEST_KIND_TO_CATEGORY[r.kind],
        municipality: muni, state: "MD",
        geom: { lng: r.lng, lat: r.lat },
        address: r.address ?? undefined, website: r.website ?? undefined,
        google_photo_url: r.photoUrl ?? undefined,
        source: "fc-gis", is_verified: true, is_operational: "operational",
        tags: ["free", "outdoor", r.kind === "playground" ? "kids-6-12" : "year-round"],
        feature_score: 5.0, _rec_objectId: r.objectId,
      });
    }
  }

  // amenity rollup onto parent parks (not place cards)
  const rollup: Record<string, { shelters: number; fields: number; facilities: number; maxShelterCap?: number }> = {};
  for (const r of recs) {
    if (!["shelter", "field", "facility"].includes(r.kind)) continue;
    const key = r.park || r.name;
    const o = (rollup[key] ??= { shelters: 0, fields: 0, facilities: 0 });
    if (r.kind === "shelter") { o.shelters++; if (r.capacity) o.maxShelterCap = Math.max(o.maxShelterCap ?? 0, r.capacity); }
    if (r.kind === "field") o.fields++;
    if (r.kind === "facility") o.facilities++;
  }

  const passport = recs.filter((r) => r.kind === "passport")
    .map((r) => ({ name: r.name, lat: r.lat, lng: r.lng, difficulty: r.difficulty, features: r.passportFeatures, photoUrl: r.photoUrl }));

  const plan = { generatedAt: new Date().toISOString(), source: "fc-gis (survey123 rec locations)",
    summary: { destinationFeatures: destRecs.length, matched, enrichments: enrich.length, coordConflicts: conflicts, newPlaces: created, placementRejected: rejectedPlacement.length, amenityParks: Object.keys(rollup).length, passportMarkers: passport.length },
    enrich, newPlaces, placementRejected: rejectedPlacement, amenityRollup: rollup, passport };
  writeFileSync(OUT, JSON.stringify(plan, null, 2));

  console.log(`\n  Rec → place merge plan (DRY RUN) → src/data/rec-merge-plan.json`);
  console.log(`  destination features (park/playground/trail): ${destRecs.length}`);
  console.log(`    matched to existing places: ${matched}  (enrichments queued: ${enrich.length}; coord conflicts: ${conflicts})`);
  console.log(`    new places to add:          ${created}`);
  console.log(`    placement rejects retained: ${rejectedPlacement.length}`);
  console.log(`  amenity rollup: ${Object.keys(rollup).length} parks gain shelter/field/facility counts`);
  console.log(`  passport markers (separate): ${passport.length}`);
  if (conflicts) {
    console.log(`\n  ⚠ coordinate conflicts (our pin >400m from the county's — likely mis-geocodes):`);
    enrich.filter((e) => e.coordConflictMeters).forEach((e) => console.log(`    ${e.name}: ${e.coordConflictMeters}m off`));
  }
  console.log("");
}

main();
