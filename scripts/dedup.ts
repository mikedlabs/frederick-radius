/**
 * Phase 1 deduplication pipeline.
 *
 * Builds src/data/places-dedup.json: a map from place slug to its
 * canonical slug, plus unique website/phone absorbed onto the canonical.
 * Curated records (manual, then seed) win over dfp. The render layer
 * applies this only behind the RADIUS_DEDUPE flag, so the default
 * behavior is unchanged.
 *
 * Run: node --import tsx scripts/dedup.ts
 * Honors src/data/dedup-decisions.json when present:
 *   { reject: ["slugA|slugB", ...], merge: ["slugA|slugB", ...] }
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { PLACES } from "../src/data/places";

type P = (typeof PLACES)[number];

const PRIORITY: Record<string, number> = { manual: 0, seed: 1 };
const prio = (p: P) => (p.source in PRIORITY ? PRIORITY[p.source] : 2);

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/['’"&]/g, "")
    .replace(/\b(the|llc|inc|co|company|and)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function lev(a: string, b: string): number {
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  let prev = Array.from({ length: bl + 1 }, (_, i) => i);
  for (let i = 1; i <= al; i++) {
    const cur = [i];
    for (let j = 1; j <= bl; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[bl];
}

const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLa = rad(b.lat - a.lat), dLo = rad(b.lng - a.lng);
  const u = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(u));
}
const addrTokens = (s: string) => new Set(norm(s).split(" ").filter(Boolean));
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / Math.min(a.size, b.size);
}

function loadDecisions(): { reject: Set<string>; merge: Set<string> } {
  const path = new URL("../src/data/dedup-decisions.json", import.meta.url).pathname;
  if (!existsSync(path)) return { reject: new Set(), merge: new Set() };
  try {
    const j = JSON.parse(readFileSync(path, "utf8")) as { reject?: string[]; merge?: string[] };
    return { reject: new Set(j.reject ?? []), merge: new Set(j.merge ?? []) };
  } catch {
    return { reject: new Set(), merge: new Set() };
  }
}

/** Pure clustering so it can be unit tested. Returns slug -> canonical (+merged). */
export function buildDedup(
  places: P[],
  decisions: { reject: Set<string>; merge: Set<string> } = { reject: new Set(), merge: new Set() },
): Record<string, { canonical: string; merged?: { website?: string; phone?: string } }> {
  const N = places.map((p) => ({ p, n: norm(p.name), a: addrTokens(p.address ?? "") }));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (x: string, y: string) => { parent.set(find(x), find(y)); };
  for (const { p } of N) parent.set(p.slug, p.slug);

  for (let i = 0; i < N.length; i++) {
    for (let j = i + 1; j < N.length; j++) {
      const A = N[i], B = N[j];
      const key = `${A.p.slug}|${B.p.slug}`;
      const key2 = `${B.p.slug}|${A.p.slug}`;
      if (decisions.reject.has(key) || decisions.reject.has(key2)) continue;
      const forced = decisions.merge.has(key) || decisions.merge.has(key2);
      const samePid =
        A.p.google_place_id && B.p.google_place_id && A.p.google_place_id === B.p.google_place_id;
      let d = Infinity;
      try { d = distM(A.p.geom, B.p.geom); } catch { /* skip */ }
      if (!forced && !samePid && d > 180) continue;
      const ml = Math.max(A.n.length, B.n.length) || 1;
      const sim = A.n && B.n ? 1 - lev(A.n, B.n) / ml : 0;
      const match =
        forced ||
        samePid ||
        (sim >= 0.84 && d <= 180 && overlap(A.a, B.a) >= 0.34) ||
        (sim >= 0.92 && d <= 120);
      if (match) union(A.p.slug, B.p.slug);
    }
  }

  // Cluster -> pick canonical by priority, then place_id, then slug.
  const clusters = new Map<string, P[]>();
  for (const { p } of N) {
    const root = find(p.slug);
    (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(p);
  }
  const out: Record<string, { canonical: string; merged?: { website?: string; phone?: string } }> = {};
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const canonical = [...members].sort(
      (a, b) =>
        prio(a) - prio(b) ||
        (b.google_place_id ? 1 : 0) - (a.google_place_id ? 1 : 0) ||
        a.slug.localeCompare(b.slug),
    )[0];
    const merged: { website?: string; phone?: string } = {};
    if (!canonical.website) {
      const w = members.find((m) => m.slug !== canonical.slug && m.website);
      if (w?.website) merged.website = w.website;
    }
    if (!canonical.phone) {
      const ph = members.find((m) => m.slug !== canonical.slug && m.phone);
      if (ph?.phone) merged.phone = ph.phone;
    }
    out[canonical.slug] = Object.keys(merged).length ? { canonical: canonical.slug, merged } : { canonical: canonical.slug };
    for (const m of members) if (m.slug !== canonical.slug) out[m.slug] = { canonical: canonical.slug };
  }
  return out;
}

function main(): void {
  const decisions = loadDecisions();
  const map = buildDedup(PLACES as P[], decisions);
  const dropped = Object.entries(map).filter(([s, v]) => v.canonical !== s).length;
  const canon = new Set(Object.values(map).map((v) => v.canonical)).size;
  writeFileSync(
    new URL("../src/data/places-dedup.json", import.meta.url).pathname,
    JSON.stringify(map, null, 0),
  );
  console.log(
    `dedup: ${PLACES.length} places, ${canon} duplicate clusters, ${dropped} records fold into a canonical.`,
  );
}

main();
