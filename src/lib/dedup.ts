/**
 * Pure deduplication pipeline. No I/O, so the script, the nightly cron,
 * and the tests all use the identical logic. scripts/dedup.ts owns the
 * file read/write; this owns the algorithm.
 */
export type DedupPlace = {
  slug: string;
  name: string;
  address?: string;
  geom: { lat: number; lng: number };
  source: string;
  google_place_id?: string;
  website?: string;
  phone?: string;
};
export type DedupEntry = { canonical: string; merged?: { website?: string; phone?: string } };
export type DedupDecisions = { reject: Set<string>; merge: Set<string> };

const PRIORITY: Record<string, number> = { manual: 0, seed: 1 };
const prio = (p: DedupPlace) => (p.source in PRIORITY ? PRIORITY[p.source] : 2);

export const normName = (s: string) =>
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
const tokens = (s: string) => new Set(normName(s).split(" ").filter(Boolean));
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / Math.min(a.size, b.size);
}

/** Slug -> canonical (+merged unique website/phone). Curated wins. */
export function buildDedup(
  places: DedupPlace[],
  decisions: DedupDecisions = { reject: new Set(), merge: new Set() },
): Record<string, DedupEntry> {
  const N = places.map((p) => ({ p, n: normName(p.name), a: tokens(p.address ?? "") }));
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
      const k1 = `${A.p.slug}|${B.p.slug}`, k2 = `${B.p.slug}|${A.p.slug}`;
      if (decisions.reject.has(k1) || decisions.reject.has(k2)) continue;
      const forced = decisions.merge.has(k1) || decisions.merge.has(k2);
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

  const clusters = new Map<string, DedupPlace[]>();
  for (const { p } of N) {
    const root = find(p.slug);
    (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(p);
  }
  const out: Record<string, DedupEntry> = {};
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
    out[canonical.slug] = Object.keys(merged).length
      ? { canonical: canonical.slug, merged }
      : { canonical: canonical.slug };
    for (const m of members) if (m.slug !== canonical.slug) out[m.slug] = { canonical: canonical.slug };
  }
  return out;
}
