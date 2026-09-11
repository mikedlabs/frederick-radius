/**
 * Ingest Phase 1 — turn the raw 1,452 discovered candidates into a
 * clean, deduped, geo-validated, municipality-tagged set, and REPORT.
 *
 * This is the "show the list before merging" step. It mutates nothing
 * in the app: it reads src/data/discovered-candidates.json and writes
 * src/data/discovered-clean.json + prints a by-town report so the
 * owner can see exactly what would fill the empty towns before any
 * merge into the canonical place set (Phase 3, separate + gated).
 *
 *   npm run ingest:candidates           # report + write clean file
 *   npm run ingest:candidates -- --quiet # write only
 */
import { readFileSync, writeFileSync } from "node:fs";
import { publicPlaces } from "@/lib/loaders/places";
import { resolveFrederickMunicipality } from "@/lib/location";
import { isNonDiscoverable } from "@/lib/relevance";
import { haversineMeters } from "@/lib/geo";
import { placementRejectionReason } from "@/lib/placement-trust";

type Candidate = {
  google_place_id?: string;
  name?: string;
  address?: string;
  primary_type?: string;
  location?: { latitude?: number; longitude?: number };
  discovered_for?: { category?: string; area?: string };
};

const STOP = new Set(["the", "a", "an", "llc", "inc", "co", "ltd", "company"]);
function normName(s: string): string {
  return (s || "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    .trim().split(" ").filter((t) => t && !STOP.has(t)).join(" ");
}
const cell = (lat: number, lng: number) => `${Math.round(lat * 100)},${Math.round(lng * 100)}`;
function nameHit(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 6 && l.includes(s);
}

const IN = new URL("../src/data/discovered-candidates.json", import.meta.url).pathname;
const OUT = new URL("../src/data/discovered-clean.json", import.meta.url).pathname;
const REJECTED = new URL("../src/data/discovered-placement-rejected.json", import.meta.url).pathname;

function main() {
  const quiet = process.argv.includes("--quiet");
  const raw = JSON.parse(readFileSync(IN, "utf8")) as Candidate[];

  // Spatial index of existing public places for dedupe.
  const existing: Record<string, { nm: string; lat: number; lng: number }[]> = {};
  for (const p of publicPlaces()) {
    (existing[cell(p.geom.lat, p.geom.lng)] ??= []).push({
      nm: normName(p.name), lat: p.geom.lat, lng: p.geom.lng,
    });
  }
  const collides = (
    idx: Record<string, { nm: string; lat: number; lng: number }[]>,
    nm: string, lat: number, lng: number,
  ): boolean => {
    const cy = Math.round(lat * 100), cx = Math.round(lng * 100);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const q of idx[`${cy + dz},${cx + dx}`] ?? []) {
        if (nameHit(nm, q.nm) && haversineMeters({ lng, lat }, { lng: q.lng, lat: q.lat }) <= 150) return true;
      }
    }
    return false;
  };

  const drop = { noName: 0, noCoord: 0, outOfCounty: 0, nonDiscoverable: 0, dupExisting: 0, dupSelf: 0 };
  const selfIdx: Record<string, { nm: string; lat: number; lng: number }[]> = {};
  const clean: Array<Candidate & { lat: number; lng: number; municipality: string }> = [];
  const rejectedPlacement: Array<{
    reason: string;
    source_address: string;
    candidate: Candidate;
  }> = [];

  for (const c of raw) {
    const name = (c.name ?? "").trim();
    if (!name) { drop.noName++; continue; }
    const lat = c.location?.latitude, lng = c.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") { drop.noCoord++; continue; }
    const reason = placementRejectionReason({ lng, lat });
    const municipality = reason
      ? null
      : resolveFrederickMunicipality({ lng, lat });
    if (reason || !municipality) {
      drop.outOfCounty++;
      rejectedPlacement.push({
        reason: reason ?? "outside-county-area",
        source_address: c.address ?? "",
        candidate: c,
      });
      continue;
    }
    if (isNonDiscoverable(c.primary_type)) { drop.nonDiscoverable++; continue; }
    const nm = normName(name);
    if (collides(existing, nm, lat, lng)) { drop.dupExisting++; continue; }
    if (collides(selfIdx, nm, lat, lng)) { drop.dupSelf++; continue; }
    (selfIdx[cell(lat, lng)] ??= []).push({ nm, lat, lng });
    clean.push({
      ...c,
      lat,
      lng,
      municipality: municipality.municipality.slug,
    });
  }

  writeFileSync(OUT, JSON.stringify(clean, null, 2));
  writeFileSync(
    REJECTED,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: "discovered-candidates.json",
        count: rejectedPlacement.length,
        rows: rejectedPlacement,
      },
      null,
      2,
    ),
  );

  if (!quiet) {
    const byMuni: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const c of clean) {
      byMuni[c.municipality] = (byMuni[c.municipality] ?? 0) + 1;
      const t = c.primary_type ?? "(none)";
      byType[t] = (byType[t] ?? 0) + 1;
    }
    const top = (o: Record<string, number>, k: number) =>
      Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k)
        .map(([x, v]) => `${v} ${x}`).join("  ");
    console.log(`\n  Ingest Phase 1 — ${raw.length} raw candidates`);
    console.log("  -------------------------------------------");
    console.log(`  dropped: no-name ${drop.noName} · no-coord ${drop.noCoord} · out-of-county ${drop.outOfCounty}`);
    console.log(`           B2B/relevance ${drop.nonDiscoverable} · dup-vs-existing ${drop.dupExisting} · dup-vs-self ${drop.dupSelf}`);
    console.log(`  CLEAN NEW PLACES: ${clean.length}`);
    console.log(`\n  by town: ${top(byMuni, 14)}`);
    console.log(`\n  top types: ${top(byType, 18)}`);
    console.log(`\n  wrote src/data/discovered-clean.json (review artifact — NOT merged)`);
    console.log(`  retained ${rejectedPlacement.length} placement rejection(s) in src/data/discovered-placement-rejected.json\n`);
  }
}

main();
