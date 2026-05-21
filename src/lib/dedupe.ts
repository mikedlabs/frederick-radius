/**
 * dedupe.ts — the ONE deterministic duplicate rule.
 *
 * The recurring "I keep seeing the same thing twice" problem was
 * architectural: dedupe lived in a hand-maintained JSON
 * (places-dedup.json) that a human had to regenerate and merge, so it
 * permanently lagged the data and every refresh reintroduced doubles.
 *
 * This module is the fix: a PURE, deterministic same-place decision
 * applied automatically at the canonical loader (and reused, verbatim,
 * by the map's OSM layer and the amenity layer). One rule, every
 * surface, zero upkeep — if a record enters the data, a dupe of it
 * can never reach a user.
 *
 * Aggressiveness is the "smart core-name + safelist" tier the owner
 * chose: it folds Google-ID matches, exact-name matches, and strong
 * shared name-cores within a tight radius (so "Clue Iq" /
 * "Clue Iq an Escape Room Experience" collapse) — but a hard
 * DISTINCT_TOKENS safelist makes it physically unable to merge
 * genuinely different places that merely share a name stem
 * ("Carroll Creek Park" vs "Carroll Creek Parking Deck", a park vs
 * its bandshell/trailhead/overlook, "Baker Park" vs "Baker Park 6").
 * Missing a borderline dupe is acceptable; destroying a distinct
 * place is not. Pure → unit-tested, isomorphic, no data imports.
 */
import { haversineMeters, type LngLat } from "@/lib/geo";

/**
 * The minimal shape the rule needs. Places, OSM pins and amenities
 * each adapt their record to this, so the SAME rule governs all three.
 */
export type DedupeRecord = {
  slug: string;
  name: string;
  geom: LngLat;
  source?: string;
  municipality?: string;
  google_place_id?: string;
  feature_score?: number;
  /** True when this record carries Google enrichment (better canonical). */
  hasEnrichment?: boolean;
};

const STOP = new Set(["the", "a", "an", "llc", "inc", "co", "ltd", "company"]);

/** Lowercase, &→and, strip punctuation, drop stopwords. Stable.
 *  Possessive apostrophes are removed (jojo's → jojos) BEFORE the
 *  general punctuation replacement, otherwise the apostrophe would
 *  split the token (jojo s) and a fuzzy match against the
 *  apostrophe-less spelling (jojos) would fail. This was the visible
 *  cause of "Jojos Restaurant Tap House" + "JoJo's Restaurant & Tap
 *  House" both appearing in the live data. */
export function normName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[’']s\b/g, "s") // d'arcy's → darcys, jojo's → jojos
    .replace(/[’']/g, "") // strip remaining apostrophes
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t && !STOP.has(t))
    .join(" ");
}

/**
 * Words stripped to reach the DISTINCTIVE core. DELIBERATELY MINIMAL:
 * only connective / geographic / filler tokens that carry zero
 * identifying information. We do NOT strip business-type nouns (cafe,
 * bar, grill, coffee, church, fellowship, studio, salon…) — those
 * DISTINGUISH places, and stripping them is exactly what wrongly
 * merged "New Hope Cafe" into "New Hope Fellowship" (a cafe is not a
 * church). The genuine dupes differ only by "&"/"and", "the", an
 * "LLC" suffix (already a stopword), a trailing "Frederick", or a
 * descriptive tail (handled by the prefix tier) — what this covers.
 */
const GENERIC = new Set([
  "and", "the", "of", "at",
  "experience", "frederick", "md", "maryland",
]);

/** The distinctive core: normName minus generic descriptor tokens. */
export function nameCore(s: string): string {
  return normName(s)
    .split(" ")
    .filter((t) => t && !GENERIC.has(t))
    .join(" ");
}

/**
 * SAFELIST — the scar-tissue guard. If a distinguishing token appears
 * in EXACTLY ONE of the two names, they are provably different places
 * and the fold is blocked no matter how alike the rest reads. This is
 * what makes the smart core-name rule safe to auto-apply: it can't
 * merge a park with its parking deck, a park with its bandshell or
 * trailhead or overlook, an annex/branch/suite, a campus tenant, or a
 * numbered sub-feature ("Baker Park" vs "Baker Park 6").
 */
const DISTINCT_TOKENS = new Set([
  "parking", "deck", "garage", "lot", "ramp",
  "trailhead", "overlook", "bandshell", "amphitheater", "amphitheatre",
  "annex", "branch", "suite", "ste", "unit", "bldg", "building",
  "field", "court", "rink", "pool", "stadium", "platform",
  "north", "south", "east", "west", "upper", "lower",
  "campus", "university", "college", "hospital", "clinic", "urgent",
  "orthopedics", "pediatrics", "outpatient", "pharmacy",
]);

function tokenSet(n: string): Set<string> {
  return new Set(n.split(" ").filter(Boolean));
}

/**
 * True when the pair carries a hard "these are different" signal: a
 * DISTINCT_TOKENS word, or a bare number, present in exactly one name.
 */
function distinctConflict(an: string, bn: string): boolean {
  const A = tokenSet(an);
  const B = tokenSet(bn);
  for (const t of DISTINCT_TOKENS) {
    if (A.has(t) !== B.has(t)) return true;
  }
  const numA = /(?:^| )\d+(?: |$)/.test(an);
  const numB = /(?:^| )\d+(?: |$)/.test(bn);
  if (numA !== numB) return true;
  return false;
}

/** Exact normalized name folds within this radius (m). */
export const R_EXACT_M = 250;
/** Core-name / safe-containment folds within this tighter radius (m). */
export const R_CORE_M = 160;

/**
 * THE rule. True when a and b are the same real-world place.
 *
 * Priority: (1) shared Google Place ID — authoritative at any
 * distance. Then, only if the hard safelist does NOT flag a conflict:
 * (2) identical normalized name within R_EXACT_M; (3) equal
 * distinctive cores within R_CORE_M; (4) one full normalized name is a
 * clean word-boundary prefix of the other within R_CORE_M. Symmetric,
 * reflexively false, pure.
 */
export function isSamePlace(a: DedupeRecord, b: DedupeRecord): boolean {
  if (a.slug === b.slug) return false;
  if (
    a.google_place_id &&
    b.google_place_id &&
    a.google_place_id === b.google_place_id
  ) {
    return true;
  }
  const an = normName(a.name);
  const bn = normName(b.name);
  if (!an || !bn) return false;
  if (distinctConflict(an, bn)) return false;
  const d = haversineMeters(a.geom, b.geom);
  // (2) identical normalized name within the wider radius.
  if (an === bn && d <= R_EXACT_M) return true;
  if (d > R_CORE_M) return false;
  // (3) equal distinctive cores ("Endangered Species Theatre Project"
  //     vs "...Project Frederick" — trailing generic differs only).
  const ca = nameCore(a.name);
  const cb = nameCore(b.name);
  if (ca && cb && ca.length >= 4 && ca === cb) return true;
  // (4) one name is a clean WORD-BOUNDARY PREFIX of the other — a
  //     place that later grew a descriptive tail ("Clue Iq" ⊑ "Clue
  //     Iq an Escape Room Experience"). PREFIX only, never an
  //     arbitrary substring, so a tenant/qualifier that sits BEFORE
  //     the shared stem ("Saxbys at Mount St. Mary's University" vs
  //     "Mount St. Mary's University") is provably NOT swallowed. The
  //     shorter side must be a substantial multi-word stem.
  // NOTE: normalized name ONLY — never the generic-stripped core. A
  // core prefix collapses to common stems ("new hope") and would
  // swallow a different entity that merely shares it; the full name
  // keeps the distinguishing word ("cafe" vs "fellowship").
  if (an !== bn) {
    const [short, long] = an.length <= bn.length ? [an, bn] : [bn, an];
    if (short.length >= 7 && short.includes(" ") && long.startsWith(short + " ")) {
      return true;
    }
  }
  return false;
}

// Curated editorial sources win the canonical slot; everything else
// ties so the cleaner enriched record (not just whichever source)
// becomes canonical.
const SRC_RANK: Record<string, number> = {
  seed: 0, manual: 0, arcgis: 1, yelp: 1, dfp: 1, google: 1,
};

function rankTuple(p: DedupeRecord): [number, number, number, number] {
  return [
    SRC_RANK[p.source ?? ""] ?? 5,
    p.hasEnrichment ? 0 : 1,
    -(p.feature_score ?? 0),
    p.name.length,
  ];
}

/** Lower-ranked record wins; deterministic slug tiebreak. */
export function pickCanonical(a: DedupeRecord, b: DedupeRecord): DedupeRecord {
  const ra = rankTuple(a);
  const rb = rankTuple(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] < rb[i] ? a : b;
  }
  return a.slug <= b.slug ? a : b;
}

const CELL = 80; // ~1.4 km cells; ±1 neighborhood covers any fold radius.
const cellKey = (lat: number, lng: number) =>
  `${Math.round(lat * CELL)},${Math.round(lng * CELL)}`;

/**
 * Deterministic fold map over a record set: `Map<droppedSlug,
 * canonicalSlug>`. Union-find so transitive dupes (A~B, B~C) collapse
 * to ONE canonical and slugs never chain. O(n) via a spatial hash
 * (plus an exact pass over shared Google IDs, which ignore distance).
 *
 * `pinned` is the manual escape hatch: any slug in it is never unioned
 * with anything, so a single bad auto-merge can be vetoed by one line
 * in places-dedup.json without touching this rule.
 */
export function autoFold(
  records: DedupeRecord[],
  pinned?: ReadonlySet<string>,
): Map<string, string> {
  const n = records.length;
  const parent = new Array(n).fill(0).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (x: number, y: number) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[rx] = ry;
  };
  const isPinned = (i: number) => Boolean(pinned?.has(records[i].slug));

  // (1) shared Google Place ID — authoritative, any distance.
  const byPid: Record<string, number[]> = {};
  for (let i = 0; i < n; i++) {
    const pid = records[i].google_place_id;
    if (pid) (byPid[pid] ??= []).push(i);
  }
  for (const grp of Object.values(byPid)) {
    for (let k = 1; k < grp.length; k++) {
      if (isPinned(grp[0]) || isPinned(grp[k])) continue;
      union(grp[0], grp[k]);
    }
  }

  // (2)+(3) spatial-hash neighborhood scan under the name rule.
  const idx: Record<string, number[]> = {};
  for (let i = 0; i < n; i++) {
    (idx[cellKey(records[i].geom.lat, records[i].geom.lng)] ??= []).push(i);
  }
  for (let i = 0; i < n; i++) {
    if (isPinned(i)) continue;
    const cy = Math.round(records[i].geom.lat * CELL);
    const cx = Math.round(records[i].geom.lng * CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of idx[`${cy + dz},${cx + dx}`] ?? []) {
          if (j <= i || isPinned(j)) continue;
          if (isSamePlace(records[i], records[j])) union(i, j);
        }
      }
    }
  }

  // Resolve each component to its canonical, then map drops → canonical.
  const components = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    (components.get(r) ?? components.set(r, []).get(r)!).push(i);
  }
  const fold = new Map<string, string>();
  for (const members of components.values()) {
    if (members.length < 2) continue;
    let canon = records[members[0]];
    for (let k = 1; k < members.length; k++) {
      canon = pickCanonical(canon, records[members[k]]);
    }
    for (const m of members) {
      if (records[m].slug !== canon.slug) {
        fold.set(records[m].slug, canon.slug);
      }
    }
  }
  return fold;
}
