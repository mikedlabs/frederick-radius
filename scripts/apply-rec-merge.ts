/**
 * Apply the rec-locations merge (companion to merge-rec-locations.ts).
 *
 * Split by risk:
 *   - Coordinate fixes (existing places whose pin is >250m from the
 *     county's authoritative point) + photo enrichments (a park missing
 *     a hero gets the verified GIS photo) are applied IN PLACE to
 *     src/data/places-client.json — low-risk corrections to records that
 *     already exist and validate, so they go live immediately.
 *   - New places (park/playground/trail the live set doesn't have) are
 *     appended to src/data/places-discovered.json (a loader SOURCE), so
 *     they flow through the normal build:client-places spine rather than
 *     being hand-injected into the served artifact.
 *
 *   tsx scripts/apply-rec-merge.ts          # report only (dry run)
 *   tsx scripts/apply-rec-merge.ts --write  # actually write the files
 */
import { readFileSync, writeFileSync } from "node:fs";
import { MUNICIPALITIES } from "@/data/municipalities";
import type { RecLocation } from "@/lib/integrations/fcRecLocations";

const REC = new URL("../src/data/rec-locations.json", import.meta.url).pathname;
const CLIENT = new URL("../src/data/places-client.json", import.meta.url).pathname;
const DISCOVERED = new URL("../src/data/places-discovered.json", import.meta.url).pathname;
const WRITE = process.argv.includes("--write");

const DEST_CAT: Record<string, string> = { park: "park", playground: "playground", trail: "trail" };
const norm = (s: string) =>
  s.toLowerCase().replace(/\b(park|trail|playground|the)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}
function nearestMuni(lat: number, lng: number): string {
  let best = "frederick", bd = Infinity;
  for (const m of MUNICIPALITIES as { slug: string; centroid?: { lat: number; lng: number } }[]) {
    if (!m.centroid) continue;
    const d = meters({ lat, lng }, m.centroid);
    if (d < bd) { bd = d; best = m.slug; }
  }
  return best;
}
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60);

type Place = { slug: string; name: string; category: string; municipality: string; geom: { lng: number; lat: number }; google_photo_url?: string };

function main() {
  const recs = JSON.parse(readFileSync(REC, "utf8")) as RecLocation[];
  const places = JSON.parse(readFileSync(CLIENT, "utf8")) as Place[];
  const discovered = JSON.parse(readFileSync(DISCOVERED, "utf8")) as Record<string, unknown>[];
  const destPlaces = places.filter((p) => ["park", "playground", "trail"].includes(p.category));

  let coordFixes = 0, photoFixes = 0, added = 0;
  const taken = new Set(places.map((p) => p.slug));
  const newRecords: Record<string, unknown>[] = [];
  const now = new Date().toISOString().slice(0, 10);

  for (const r of recs.filter((x) => DEST_CAT[x.kind])) {
    const rn = norm(r.name);
    const cat = DEST_CAT[r.kind];
    let best: Place | null = null, bd = Infinity;
    // Match within the SAME category only — a trail must not match (and
    // then "correct" the coords of) a same-named park; they're distinct
    // features at different points.
    for (const p of destPlaces) {
      if (p.category !== cat) continue;
      const pn = norm(p.name);
      if (!(pn === rn || (rn && pn && (pn.includes(rn) || rn.includes(pn))))) continue;
      const d = meters(r, p.geom);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      if (bd > 250) { // mis-geocode → correct to the county's point
        if (WRITE) best.geom = { lng: r.lng, lat: r.lat };
        coordFixes++;
      }
      if (!best.google_photo_url && r.photoUrl) {
        if (WRITE) best.google_photo_url = r.photoUrl;
        photoFixes++;
      }
    } else if (r.kind === "park") {
      // Only ADD genuinely-missing parks. Playgrounds/trails are usually
      // named after their parent park, so adding them as standalone cards
      // would duplicate a park at the same point — defer those to an
      // amenity-rollup pass.
      const muni = nearestMuni(r.lat, r.lng);
      let slug = `${slugify(r.name)}-${muni}`; let n = 2;
      while (taken.has(slug)) slug = `${slugify(r.name)}-${muni}-${n++}`;
      taken.add(slug);
      newRecords.push({
        slug, name: r.name, category: DEST_CAT[r.kind], municipality: muni,
        city: muni, state: "MD", postal_code: "",
        geom: { lng: r.lng, lat: r.lat },
        address: r.address ?? "", website: r.website ?? undefined,
        google_photo_url: r.photoUrl ?? undefined,
        short_blurb: "Park in Frederick County.",
        tags: ["free", "outdoor", "year-round"],
        source: "fc-gis", is_verified: true, is_operational: "operational",
        feature_score: 5.0, updated_at: now, last_verified_at: `${now}T00:00:00Z`,
      });
      added++;
    }
  }

  console.log(`\n  Rec merge apply ${WRITE ? "(WRITE)" : "(dry run)"}:`);
  console.log(`    coordinate fixes : ${coordFixes}  (existing pins corrected to county GIS)`);
  console.log(`    photo enrichments: ${photoFixes}  (parks given the verified GIS hero)`);
  console.log(`    new places       : ${added}  → places-discovered.json`);

  if (WRITE) {
    writeFileSync(CLIENT, JSON.stringify(places));
    writeFileSync(DISCOVERED, JSON.stringify(discovered.concat(newRecords), null, 2));
    console.log("\n  Wrote places-client.json (fixes live) + appended new places to places-discovered.json.");
    console.log("  Durability: run `npm run build:client-places` so the new places fold into the served set.\n");
  } else {
    console.log("\n  Dry run — pass --write to apply.\n");
  }
}

main();
