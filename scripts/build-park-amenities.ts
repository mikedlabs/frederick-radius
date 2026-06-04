/**
 * Build src/data/park-amenities.json — a sidecar that rolls the county
 * Parks & Rec amenity points (rec-locations.json) UP onto their parent
 * park, keyed by the park's place slug. This is how shelters, fields,
 * playgrounds, and trails enrich a park card WITHOUT becoming dozens of
 * duplicate standalone cards (the "answers, not a directory" rule).
 *
 * Sidecar pattern (like parking-garages.ts): survives build:client-places
 * because it's keyed by slug and read alongside the place, not baked into
 * the generated place record.
 *
 *   npm run build:park-amenities
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { RecLocation } from "@/lib/integrations/fcRecLocations";

const REC = new URL("../src/data/rec-locations.json", import.meta.url).pathname;
const CLIENT = new URL("../src/data/places-client.json", import.meta.url).pathname;
const DISCOVERED = new URL("../src/data/places-discovered.json", import.meta.url).pathname;
const OUT = new URL("../src/data/park-amenities.json", import.meta.url).pathname;

type Place = { slug: string; name: string; category: string };
const norm = (s: string) =>
  s.toLowerCase().replace(/\b(park|the)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

type Amenities = {
  playgrounds: number;
  shelters: number;
  fields: number;
  facilities: number;
  trails: number;
  /** Largest shelter capacity, when known. */
  maxShelterCap?: number;
  /** Total mapped trail miles at this park, when known. */
  trailMiles?: number;
  /** Any amenity flagged barrier-free / accessible. */
  barrierFree?: boolean;
};

function main() {
  const recs = JSON.parse(readFileSync(REC, "utf8")) as RecLocation[];
  const client = JSON.parse(readFileSync(CLIENT, "utf8")) as Place[];
  const discovered = JSON.parse(readFileSync(DISCOVERED, "utf8")) as Place[];
  const parks = [...client, ...discovered].filter((p) => p.category === "park");

  // Roll amenities up by parent-park NAME first.
  const byPark: Record<string, Amenities> = {};
  for (const r of recs) {
    if (r.kind === "park") continue;
    const parent = (r.park || r.name).trim();
    const a = (byPark[parent] ??= { playgrounds: 0, shelters: 0, fields: 0, facilities: 0, trails: 0 });
    if (r.kind === "playground") a.playgrounds++;
    else if (r.kind === "shelter") { a.shelters++; if (r.capacity) a.maxShelterCap = Math.max(a.maxShelterCap ?? 0, r.capacity); }
    else if (r.kind === "field") a.fields++;
    else if (r.kind === "facility") a.facilities++;
    else if (r.kind === "trail") { a.trails++; if (r.trailLengthMi) a.trailMiles = +((a.trailMiles ?? 0) + r.trailLengthMi).toFixed(2); }
    if (r.barrierFree) a.barrierFree = true;
  }

  // Map park name → place slug.
  const bySlug: Record<string, Amenities> = {};
  let matched = 0, unmatched = 0;
  for (const [parkName, amen] of Object.entries(byPark)) {
    const pn = norm(parkName);
    // EXACT normalized match only — a contains-match wrongly attached the
    // big "Ballenger Creek Park" amenities to "Ballenger Creek Dog Park".
    // Better no rollup than the wrong park's amenities.
    const place = parks.find((p) => norm(p.name) === pn);
    if (place) { bySlug[place.slug] = amen; matched++; }
    else unmatched++;
  }

  writeFileSync(OUT, JSON.stringify(bySlug, null, 0));
  const totals = Object.values(bySlug).reduce(
    (t, a) => ({ playgrounds: t.playgrounds + a.playgrounds, shelters: t.shelters + a.shelters, fields: t.fields + a.fields, trails: t.trails + a.trails }),
    { playgrounds: 0, shelters: 0, fields: 0, trails: 0 },
  );
  console.log(`\n  park-amenities.json: ${matched} parks enriched (${unmatched} parent names unmatched)`);
  console.log(`  rolled up — playgrounds:${totals.playgrounds} shelters:${totals.shelters} fields:${totals.fields} trails:${totals.trails}\n`);
}

main();
