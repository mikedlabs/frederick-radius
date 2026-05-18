/**
 * Generate dedup folds from authoritative signals, for review.
 *
 * Two signals: (1) shared google_place_id = definitively the same
 * place; (2) fuzzy name (equal or contained, >=6 chars) within 120m.
 * Canonical pick priority: curated source (seed/manual) > has Google
 * enrichment > higher feature_score > shorter (cleaner) name.
 *
 * Prints the entries to MERGE into src/data/places-dedup.json plus a
 * human summary. Re-runnable (npm run gen:dedup); reviewed before
 * commit — never auto-applied. Mutates nothing.
 */
import { PLACES } from "@/data/places";
import { haversineMeters } from "@/lib/geo";
import ENRICH from "@/data/places-enrichment.json" with { type: "json" };
import DEDUP from "@/data/places-dedup.json" with { type: "json" };

const enr = ENRICH as Record<string, unknown>;
const existing = DEDUP as Record<string, { canonical: string }>;
// Curated editorial sources win; everything else ties so the cleaner,
// enriched record (not just whichever source) becomes canonical.
const SRC_RANK: Record<string, number> = { seed: 0, manual: 0, arcgis: 1, yelp: 1, dfp: 1, google: 1 };

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    .trim().split(" ").filter((t) => t && !["the", "a", "an", "llc", "inc", "co", "ltd", "company"].includes(t)).join(" ");
}
const cell = (lat: number, lng: number) => `${Math.round(lat * 80)},${Math.round(lng * 80)}`;

type P = (typeof PLACES)[number];
// Lower = better canonical.
function rank(p: P): [number, number, number, number] {
  return [
    SRC_RANK[p.source] ?? 5,
    enr[p.slug] ? 0 : 1, // has enrichment wins
    -(p.feature_score ?? 0),
    p.name.length,
  ];
}
function better(a: P, b: P): P {
  const ra = rank(a), rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? a : b;
  return a.slug <= b.slug ? a : b;
}

function main() {
  const bySlug = new Map(PLACES.map((p) => [p.slug, p]));
  const pairs: [P, P][] = [];

  // (1) shared google_place_id
  const byPid: Record<string, P[]> = {};
  for (const p of PLACES) if (p.google_place_id) (byPid[p.google_place_id] ??= []).push(p);
  for (const grp of Object.values(byPid)) {
    if (grp.length < 2) continue;
    // A shared google_place_id is authoritative. Curated wins if
    // present; else the google-discovered record (it IS the verified
    // Place-ID match, properly named) over a scrape.
    const curated = grp.find((p) => p.source === "seed" || p.source === "manual");
    const canon = curated ?? grp.find((p) => p.source === "google") ?? grp.reduce(better);
    for (const p of grp) if (p.slug !== canon.slug) pairs.push([canon, p]);
  }

  // (2) fuzzy name + within 120m
  const idx: Record<string, P[]> = {};
  for (const p of PLACES) (idx[cell(p.geom.lat, p.geom.lng)] ??= []).push(p);
  const seen = new Set<string>();
  for (const p of PLACES) {
    const n = norm(p.name);
    if (!n) continue;
    const cy = Math.round(p.geom.lat * 80), cx = Math.round(p.geom.lng * 80);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const q of idx[`${cy + dz},${cx + dx}`] ?? []) {
        if (q.slug === p.slug) continue;
        const key = [p.slug, q.slug].sort().join("::");
        if (seen.has(key)) continue;
        const qn = norm(q.name);
        const [s, l] = n.length <= qn.length ? [n, qn] : [qn, n];
        if ((n === qn || (s.length >= 6 && l.includes(s))) && haversineMeters(p.geom, q.geom) <= 120) {
          seen.add(key);
          const canon = better(p, q);
          pairs.push([canon, canon.slug === p.slug ? q : p]);
        }
      }
    }
  }

  // Build fold entries (drop -> canonical), skip ones already folded.
  const folds: Record<string, { canonical: string }> = {};
  const summary: string[] = [];
  for (const [canon, drop] of pairs) {
    if (existing[drop.slug] || folds[drop.slug]) continue;
    if (drop.slug === canon.slug) continue;
    // never fold the canonical itself; never chain
    if (existing[canon.slug] && existing[canon.slug].canonical !== canon.slug) continue;
    folds[drop.slug] = { canonical: canon.slug };
    summary.push(`  drop "${drop.name}"[${drop.source}] → "${canon.name}"[${canon.source}]`);
  }

  console.log(`\n${Object.keys(folds).length} new dedup folds (review, then merge into places-dedup.json):\n`);
  console.log(summary.join("\n"));
  console.log(`\n--- JSON to merge ---\n${JSON.stringify(folds, null, 2)}\n`);
  // sanity: every canonical must exist and not itself be dropped
  const bad = Object.values(folds).filter((f) => !bySlug.has(f.canonical) || folds[f.canonical]);
  console.log(bad.length ? `!! ${bad.length} invalid canonicals` : "all canonicals valid, no chains");
}

main();
