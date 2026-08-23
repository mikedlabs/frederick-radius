/**
 * `npm run data:review` — the data-cleaning console.
 *
 * Data is the backbone, and the safe auto-engine deliberately leaves a
 * judgement tail it must not touch (typo dupes like "Summitra" vs
 * "Sumittra Thai Cuisine", junk records, wrong categories). This finds
 * that tail in the set the user ACTUALLY sees (publicPlaces) and
 * separates review-only pairs from the very small typo-at-the-same-point
 * set that is safe enough to format as a proposed override. It mutates
 * nothing and is re-runnable. Every proposed fold still requires review.
 */
import { PLACES } from "@/data/places";
import { decoratePlace, publicPlaces } from "@/lib/loaders/places";
import { isSamePlace } from "@/lib/dedupe";
import { nearDupeCandidates, type DupeRecord } from "@/lib/overrides";
import ENRICH from "@/data/places-enrichment.json" with { type: "json" };
import OVERRIDES from "@/data/places-overrides.json" with { type: "json" };
import { categoryFromPrimaryType } from "@/lib/categoryFromGoogle";
import {
  hasCategoryDisposition,
  type CategoryDispositionPatch,
} from "./lib/category-disposition";

const enr = ENRICH as Record<
  string,
  { rating?: number; photo_names?: string[]; editorial_summary?: string; primary_type?: string }
>;
const ov = OVERRIDES as {
  fold?: Record<string, string>;
  remove?: string[];
  patch?: Record<string, CategoryDispositionPatch>;
};
const ovFold = ov.fold ?? {};
const ovRemove = new Set(ov.remove ?? []);
const ovPatch = ov.patch ?? {};

const bySlug = new Map(PLACES.map((p) => [p.slug, p]));
const survivors = publicPlaces();
const CURATED = new Set(["seed", "manual"]);

function pickDrop(aSlug: string, bSlug: string): { drop: string; canon: string } {
  const a = bySlug.get(aSlug)!;
  const b = bySlug.get(bSlug)!;
  const score = (s: typeof a) =>
    (CURATED.has(s.source) ? 100 : 0) +
    (enr[s.slug]?.rating ? 10 : 0) +
    (enr[s.slug]?.photo_names?.length ? 5 : 0) +
    s.name.length / 100; // longer (fuller) name as a gentle tiebreak
  return score(a) >= score(b)
    ? { canon: a.slug, drop: b.slug }
    : { canon: b.slug, drop: a.slug };
}

// ── 1. Fuzzy / typo near-dupes the safe engine intentionally skips ──
const recs: DupeRecord[] = survivors.map((p) => {
  const shipped = decoratePlace(p);
  return {
    slug: shipped.slug,
    name: shipped.name,
    source: shipped.source,
    municipality: shipped.municipality,
    category: shipped.category,
    lng: shipped.geom.lng,
    lat: shipped.geom.lat,
  };
});
const cands = nearDupeCandidates(recs).filter((c) => {
  if (ovFold[c.a.slug] || ovFold[c.b.slug]) return false; // already handled
  const A = bySlug.get(c.a.slug)!;
  const B = bySlug.get(c.b.slug)!;
  // Skip what the deterministic engine already folds on its own.
  return !isSamePlace(
    { slug: A.slug, name: A.name, geom: A.geom, source: A.source, google_place_id: A.google_place_id },
    { slug: B.slug, name: B.name, geom: B.geom, source: B.source, google_place_id: B.google_place_id },
  );
});

const foldSuggest: Record<string, string> = {};
console.log(`\n=== 1. Possible duplicates for human review (${cands.length}) ===`);
console.log("   (review candidates, not automatic merge instructions)\n");
for (const c of cands) {
  const { drop, canon } = pickDrop(c.a.slug, c.b.slug);
  // Only format a fold proposal for the narrow class this detector was built
  // to find: a small spelling edit at effectively the same location. Shared
  // tokens can describe distinct hotels, churches, or facilities and stay
  // review-only.
  const canProposeFold = c.why.startsWith("name typo") && c.distance_m <= 30;
  if (canProposeFold && foldSuggest[canon] !== drop) {
    foldSuggest[drop] = canon;
  }
  console.log(
    `  • "${bySlug.get(drop)!.name}" [${bySlug.get(drop)!.source}]  →  ` +
      `"${bySlug.get(canon)!.name}" [${bySlug.get(canon)!.source}]   ` +
      `(${c.why}, ${Math.round(c.distance_m)} m, ` +
      `${canProposeFold ? "fold proposal" : "review only"})`,
  );
}

// ── 2. Thin junk: a name + point, nothing else (remove candidates) ──
const thin = survivors.filter((p) => {
  if (CURATED.has(p.source)) return false;
  if (p.hero_image) return false;
  const e = enr[p.slug];
  return !e || (!e.rating && !(e.photo_names?.length) && !e.editorial_summary?.trim());
});
console.log(`\n=== 2. Thin records (no rating/photo/blurb) — remove? (${thin.length}) ===`);
for (const p of thin.slice(0, 15)) console.log(`  • ${p.slug}  "${p.name}" [${p.category}]`);
if (thin.length > 15) console.log(`  …and ${thin.length - 15} more`);

// ── 3. Likely miscategorized vs Google's primaryType (patch.category) ──
// Review the category that actually reaches users. `publicPlaces()` is the
// canonical filtered set but it intentionally returns the pre-decoration
// record; `decoratePlace()` applies the Google correction and human override
// precedence used by lists, search, Ask, and the map. The old comparison
// therefore re-reported hundreds of already-corrected rows as work.
const misc: { slug: string; from: string; to: string; name: string }[] = [];
for (const p of survivors) {
  const shipped = decoratePlace(p);
  const t = enr[p.slug]?.primary_type;
  const sugg = t ? categoryFromPrimaryType(t) : null;
  // A human category patch is the final word by contract. Do not turn an
  // intentional exception back into a recurring audit false positive.
  if (hasCategoryDisposition(ovPatch[p.slug])) continue;
  if (sugg && sugg !== shipped.category) {
    misc.push({
      slug: p.slug,
      from: shipped.category,
      to: sugg,
      name: p.name,
    });
  }
}
console.log(`\n=== 3. Likely mis-categorized (Google primaryType) — patch? (${misc.length}) ===`);
for (const m of misc.slice(0, 15))
  console.log(`  • ${m.slug}  "${m.name}"  ${m.from} → ${m.to}`);
if (misc.length > 15) console.log(`  …and ${misc.length - 15} more`);

// ── Paste-ready block ──────────────────────────────────────────────
console.log(`\n=== Reviewed typo-fold proposals for places-overrides.json ===\n`);
console.log(JSON.stringify({ fold: foldSuggest }, null, 2));
console.log(
  `\n(${Object.keys(foldSuggest).length} folds suggested, ` +
    `${ovRemove.size} already removed, ${Object.keys(ovFold).length} already folded. ` +
    `Review every line before committing — this tool decides nothing.)\n`,
);
