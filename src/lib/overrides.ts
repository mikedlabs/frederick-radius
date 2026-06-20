/**
 * overrides.ts — the human data-cleaning layer (pure, unit-tested).
 *
 * The dedupe engine (dedupe.ts) is deliberately conservative: it will
 * never merge "Summitra" with "Sumittra Thai Cuisine" because bridging
 * a spelling typo needs fuzzy matching, and fuzzy matching destroys
 * distinct places ("River Pub" vs "River Park"). That judgement tail
 * — typos, "is this really the same?", junk records, wrong category —
 * is irreducible. The answer is not a more aggressive auto-rule; it is
 * a fast HUMAN override that the canonical loader applies every time,
 * so a fix is one line in data and lands on every surface forever.
 *
 * `places-overrides.json` is that file. This module is the pure logic
 * the loader wires in, plus the near-dupe DETECTOR the
 * `npm run data:review` tool uses to find the Summitra-class problems
 * for a human to approve. No data imports → isomorphic, testable.
 */

export type PatchFields = {
  name?: string;
  category?: string;
  short_blurb?: string;
  /** Remap an out-of-vocabulary / wrong municipality slug to a valid one (the
   *  unincorporated communities Jefferson, Ijamsville, etc. have no town page,
   *  so a place tagged with them silently drops from every municipality filter). */
  municipality?: string;
  /** Null the MISATTRIBUTED Google rating + review count: this slug was enriched
   *  with another (co-located/same-address) business's Google listing, so its
   *  rating belongs to a different business. Verified per-place by web check
   *  (2026-06-20 phantom-ratings sweep). */
  clearGoogle?: boolean;
  /** Null the misattributed hero photo (it shows the OTHER business). */
  clearPhoto?: boolean;
};

export type Overrides = {
  /** drop slug → canonical slug (human fuzzy/typo folds). */
  fold?: Record<string, string>;
  /** slugs hidden from every surface (junk / not a real place). */
  remove?: string[];
  /** slugs the automatic engine must never fold away (manual veto). */
  keepApart?: string[];
  /** shallow per-slug field corrections (rename / recategorize / blurb). */
  patch?: Record<string, PatchFields>;
};

/**
 * Follow a slug through any number of fold maps (auto + human +
 * legacy) to the final surviving canonical, with a visited guard so a
 * malformed cycle can never hang the loader. Last map wins ties only
 * by being consulted; all are merged first by the caller's order.
 */
export function makeResolver(
  folds: ReadonlyArray<ReadonlyMap<string, string> | Record<string, string>>,
): (slug: string) => string {
  const get = (
    m: ReadonlyMap<string, string> | Record<string, string>,
    k: string,
  ): string | undefined =>
    m instanceof Map ? m.get(k) : (m as Record<string, string>)[k];
  return (slug: string): string => {
    let cur = slug;
    const seen = new Set<string>([cur]);
    for (let hop = 0; hop < 8; hop++) {
      let next: string | undefined;
      for (const m of folds) {
        const v = get(m, cur);
        if (v && v !== cur) {
          next = v;
          break;
        }
      }
      if (!next || seen.has(next)) break;
      seen.add(next);
      cur = next;
    }
    return cur;
  };
}

/** Shallow-apply a patch to a record. Identity when nothing is patched. */
export function patchRecord<T extends { slug: string }>(
  p: T,
  patch: Overrides["patch"],
): T {
  const x = patch?.[p.slug];
  if (!x) return p;
  const out: T = { ...p };
  if (x.name) (out as Record<string, unknown>).name = x.name;
  if (x.category) (out as Record<string, unknown>).category = x.category;
  if (x.short_blurb) (out as Record<string, unknown>).short_blurb = x.short_blurb;
  if (x.municipality) (out as Record<string, unknown>).municipality = x.municipality;
  // clearGoogle / clearPhoto are applied in decoratePlace AFTER applyEnrichment
  // (which re-derives google_rating/photo from the raw enrichment, so nulling
  // them here would be clobbered).
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Near-duplicate DETECTOR (powers `npm run data:review`)
// ───────────────────────────────────────────────────────────────────────────

const STOP = new Set(["the", "a", "an", "llc", "inc", "co", "ltd", "company"]);

export function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t && !STOP.has(t))
    .join(" ");
}

/** Bounded Levenshtein — returns early once it exceeds `max`. */
export function levenshtein(a: string, b: string, max = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function tokenJaccard(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export type DupeRecord = {
  slug: string;
  name: string;
  source?: string;
  municipality?: string;
  lng: number;
  lat: number;
};

export type DupeCandidate = {
  a: DupeRecord;
  b: DupeRecord;
  score: number; // 0..1, higher = more likely the same place
  why: string;
};

function metersBetween(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Find the fuzzy near-dupes the SAFE engine intentionally skips:
 * very close (≤150 m), same municipality, names that are a typo or a
 * stem-of variant of each other (the "Summitra" / "Sumittra Thai
 * Cuisine" class). This is a REVIEW list — a human approves each into
 * places-overrides.json — so it is tuned to surface, not to decide.
 */
export function nearDupeCandidates(
  records: DupeRecord[],
  opts: { maxMeters?: number; limit?: number } = {},
): DupeCandidate[] {
  const maxM = opts.maxMeters ?? 150;
  // ~250 m spatial cells; a ±1 sweep covers maxM with margin.
  const K = 400;
  const idx: Record<string, number[]> = {};
  records.forEach((r, i) => {
    (idx[`${Math.round(r.lat * K)},${Math.round(r.lng * K)}`] ??= []).push(i);
  });
  const out: DupeCandidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const na = norm(r.name);
    if (na.length < 3) continue;
    const cy = Math.round(r.lat * K);
    const cx = Math.round(r.lng * K);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of idx[`${cy + dz},${cx + dx}`] ?? []) {
          if (j <= i) continue;
          const q = records[j];
          const key = [r.slug, q.slug].sort().join("::");
          if (seen.has(key)) continue;
          const nb = norm(q.name);
          if (nb.length < 3) continue;
          if (na === nb) continue; // exact → the auto engine handles it
          if (
            (r.municipality ?? "") !== (q.municipality ?? "") ||
            metersBetween(r, q) > maxM
          ) {
            continue;
          }
          const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
          // Compare the shorter name against the longer's LEADING
          // TOKENS of the same token-count. A typo lives inside a
          // shared word ("summitra" vs the leading "sumittra" of
          // "sumittra thai cuisine") and passes; two distinct places
          // that differ in a whole trailing word ("river pub" vs
          // "river park") do NOT — that was the false-positive.
          const longHead = long
            .split(" ")
            .slice(0, short.split(" ").length)
            .join(" ");
          const lev = Math.min(
            levenshtein(short, long, 4),
            levenshtein(short, longHead, 4),
          );
          const jac = tokenJaccard(na, nb);
          const tol = short.length <= 6 ? 1 : short.length <= 12 ? 2 : 3;
          let score = 0;
          let why = "";
          if (lev <= tol) {
            score = 1 - lev / (tol + 2);
            why = `name typo (edit distance ${lev})`;
          } else if (jac >= 0.6) {
            score = jac;
            why = `shared name tokens (${jac.toFixed(2)})`;
          }
          if (score > 0) {
            seen.add(key);
            out.push({ a: r, b: q, score, why });
          }
        }
      }
    }
  }
  return out
    .sort((x, y) => y.score - x.score)
    .slice(0, opts.limit ?? 200);
}
