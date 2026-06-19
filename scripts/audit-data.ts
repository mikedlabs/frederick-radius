/**
 * Full data audit — correctness + duplication across the live place
 * set every surface reads (publicPlaces). Pure reporting, mutates
 * nothing. Re-runnable: `npm run audit:data`.
 *
 * Honest by design: it reports real counts + concrete examples so the
 * owner sees exactly what is wrong, not a vibes "looks fine".
 */
import { publicPlaces, decoratePlace } from "@/lib/loaders/places";
import { PLACES } from "@/data/places";
import { isNonDiscoverable } from "@/lib/relevance";
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";
import { isPlaceholderBlurb } from "@/lib/copy-quality";
import { haversineMeters } from "@/lib/geo";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import ENRICH from "@/data/places-enrichment.json" with { type: "json" };

const COUNTY = { s: 39.265, w: -77.7, n: 39.745, e: -77.15 };
const enr = ENRICH as Record<string, { primary_type?: string; editorial_summary?: string }>;

function norm(s: string): string {
  return (s || "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    .trim().split(" ").filter((t) => t && !["the", "a", "an", "llc", "inc", "co", "ltd", "company"].includes(t)).join(" ");
}
const cell = (lat: number, lng: number) => `${Math.round(lat * 80)},${Math.round(lng * 80)}`; // ~1.4km
const ex = (a: string[], n = 6) => a.slice(0, n).join(" | ") + (a.length > n ? ` … +${a.length - n}` : "");

function main() {
  const pub = publicPlaces();
  const dec = pub.map((p) => decoratePlace(p));
  console.log(`\n=== FREDERICK RADIUS DATA AUDIT ===`);
  console.log(`raw PLACES ${PLACES.length} · publicPlaces ${pub.length} · enrichment rows ${Object.keys(enr).length}`);

  // by source / municipality
  const bySrc: Record<string, number> = {};
  const byMuni: Record<string, number> = {};
  for (const p of pub) {
    bySrc[p.source] = (bySrc[p.source] ?? 0) + 1;
    byMuni[p.municipality] = (byMuni[p.municipality] ?? 0) + 1;
  }
  console.log(`source: ${Object.entries(bySrc).map(([k, v]) => `${k}:${v}`).join("  ")}`);
  console.log(`muni:   ${Object.entries(byMuni).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  ")}`);

  // 1. DUPLICATES — fuzzy: same/contained normalized name within 120m.
  const idx: Record<string, { slug: string; n: string; lat: number; lng: number; src: string }[]> = {};
  for (const p of pub) {
    (idx[cell(p.geom.lat, p.geom.lng)] ??= []).push({
      slug: p.slug, n: norm(p.name), lat: p.geom.lat, lng: p.geom.lng, src: p.source,
    });
  }
  const dupPairs: string[] = [];
  const dupSeen = new Set<string>();
  for (const p of pub) {
    const n = norm(p.name);
    if (!n) continue;
    const cy = Math.round(p.geom.lat * 80), cx = Math.round(p.geom.lng * 80);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const q of idx[`${cy + dz},${cx + dx}`] ?? []) {
        if (q.slug === p.slug) continue;
        const pair = [p.slug, q.slug].sort().join("::");
        if (dupSeen.has(pair)) continue;
        const short = n.length <= q.n.length ? n : q.n;
        const long = n.length <= q.n.length ? q.n : n;
        const nameHit = n === q.n || (short.length >= 6 && long.includes(short));
        if (nameHit && haversineMeters(p.geom, { lng: q.lng, lat: q.lat }) <= 120) {
          dupSeen.add(pair);
          dupPairs.push(`${p.name}[${p.source}] ≈ ${pub.find((x) => x.slug === q.slug)?.name}[${q.src}]`);
        }
      }
    }
  }

  // 2. COORDINATES
  const offCounty = pub.filter((p) => {
    const { lat, lng } = p.geom;
    return lat < COUNTY.s || lat > COUNTY.n || lng < COUNTY.w || lng > COUNTY.e;
  });
  const nullIsland = pub.filter((p) => Math.abs(p.geom.lat) < 0.5 && Math.abs(p.geom.lng) < 0.5);
  const coordClump: Record<string, string[]> = {};
  for (const p of pub) (coordClump[`${p.geom.lat.toFixed(5)},${p.geom.lng.toFixed(5)}`] ??= []).push(p.name);
  const stackedCoords = Object.entries(coordClump).filter(([, v]) => v.length >= 4);

  // 3. CATEGORY / RELEVANCE
  const relevanceLeak = pub.filter((p) => isNonDiscoverable(enr[p.slug]?.primary_type));
  const catDisagree = pub.filter((p) => {
    const fromG = categoryFromPrimaryType(enr[p.slug]?.primary_type);
    return fromG && fromG !== p.category;
  });

  // 4. MUNICIPALITY
  const badMuni = pub.filter((p) => !MUNICIPALITY_BY_SLUG[p.municipality]);

  // 5. OPERATIONAL leak (should be impossible — isOperational filters)
  const closedLeak = pub.filter(
    (p) => p.is_operational === "closed_permanently" || p.is_operational === "closed_temporarily",
  );

  // 6. REQUIRED FIELDS
  const missing = pub.filter((p) => !p.name?.trim() || !p.short_blurb?.trim() || !p.category);

  // 7. BLURBS — placeholder "<Cat> in <Town>." vs real (shared detector, so
  // this count and the render-time suppression in knownFor/cleanCopy agree).
  const placeholder = dec.filter((p) => isPlaceholderBlurb(p.short_blurb)).length;

  // 8. ENRICHMENT integrity
  const slugs = new Set(PLACES.map((p) => p.slug));
  const orphanEnr = Object.keys(enr).filter((k) => !slugs.has(k));
  const withEditorial = Object.values(enr).filter((v) => v.editorial_summary?.trim()).length;

  // 9. SLUG uniqueness (raw)
  const seen = new Set<string>();
  const dupSlugs = PLACES.map((p) => p.slug).filter((s) => (seen.has(s) ? true : (seen.add(s), false)));

  const F = (label: string, n: number, sev: string) =>
    console.log(`${sev} ${label.padEnd(42)} ${n}`);
  console.log(`\n--- FINDINGS (severity) ---`);
  F("Duplicate candidates (name≈ & ≤120m)", dupPairs.length, dupPairs.length > 50 ? "🔴" : dupPairs.length ? "🟠" : "🟢");
  F("Out-of-county coordinates", offCounty.length, offCounty.length ? "🔴" : "🟢");
  F("Null-island (0,0) coords", nullIsland.length, nullIsland.length ? "🔴" : "🟢");
  F("Coordinate clumps (≥4 identical)", stackedCoords.length, stackedCoords.length > 5 ? "🟠" : "🟢");
  F("Relevance-hidden type still public", relevanceLeak.length, relevanceLeak.length ? "🟠" : "🟢");
  F("Category disagrees w/ Google type", catDisagree.length, catDisagree.length > 100 ? "🟠" : "🟢");
  F("Unknown municipality", badMuni.length, badMuni.length ? "🔴" : "🟢");
  F("Closed place leaked into public", closedLeak.length, closedLeak.length ? "🔴" : "🟢");
  F("Missing name/blurb/category", missing.length, missing.length ? "🔴" : "🟢");
  F("Placeholder blurbs", placeholder, placeholder > 800 ? "🟠" : "🟢");
  F("Orphan enrichment rows (no place)", orphanEnr.length, orphanEnr.length > 200 ? "🟠" : "🟢");
  F("Duplicate raw slugs", dupSlugs.length, dupSlugs.length ? "🔴" : "🟢");
  console.log(`(context: ${withEditorial} real Google blurbs; ${pub.length - placeholder} non-placeholder)`);

  console.log(`\n--- EXAMPLES ---`);
  if (dupPairs.length) console.log(`dupes: ${ex(dupPairs, 12)}`);
  if (offCounty.length) console.log(`off-county: ${ex(offCounty.map((p) => `${p.name}(${p.geom.lat.toFixed(3)},${p.geom.lng.toFixed(3)})`))}`);
  if (stackedCoords.length) console.log(`coord-clumps: ${ex(stackedCoords.map(([c, v]) => `${c}×${v.length}`))}`);
  if (relevanceLeak.length) console.log(`B2B-leak: ${ex(relevanceLeak.map((p) => `${p.name}[${enr[p.slug]?.primary_type}]`))}`);
  if (badMuni.length) console.log(`bad-muni: ${ex(badMuni.map((p) => `${p.name}=${p.municipality}`))}`);
  if (catDisagree.length) console.log(`cat≠Google: ${ex(catDisagree.slice(0, 8).map((p) => `${p.name} ${p.category}→${categoryFromPrimaryType(enr[p.slug]?.primary_type)}`))}`);
  console.log("");
}

main();
