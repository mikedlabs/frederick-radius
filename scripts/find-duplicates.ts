/**
 * find-duplicates.ts — comprehensive place-data duplicate audit.
 *
 * Runs after the existing dedupe pipeline (publicPlaces() is the
 * post-dedup canonical set), then applies a STRICTER similarity check
 * to surface near-duplicates the rule missed.
 *
 * What "near-duplicate" means here:
 *   - Token-set Jaccard similarity ≥ 0.6 on normalized names
 *   - Same municipality
 *   - Within 500 m of each other
 *   - At least one shared word that is NOT a generic descriptor
 *
 * Then classifies each pair by confidence:
 *
 *   HIGH       — Both records share a "core" of 2+ distinctive tokens,
 *                are < 60 m apart, and have no DISTINCT_TOKENS conflict.
 *                Auto-mergeable into dedup-decisions.json.
 *   MEDIUM     — Strong name overlap but >60 m, or a sub-feature word
 *                ("Bookstore", "Bandshell", "Playground", etc.) in one
 *                of them. Needs human review.
 *   LOW        — Loose name match only. Probably distinct.
 *
 * Outputs:
 *   - scripts/find-duplicates-report.json   (everything, by confidence)
 *   - --auto-merge writes HIGH pairs into src/data/dedup-decisions.json
 *
 * Run:
 *   node --import tsx scripts/find-duplicates.ts             (report only)
 *   node --import tsx scripts/find-duplicates.ts --auto-merge (apply)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { publicPlaces } from "../src/lib/loaders/places";

const STOPWORDS = new Set([
  "the", "a", "an", "llc", "inc", "co", "ltd", "company",
  "and", "of", "at", "frederick", "md", "maryland", "experience",
]);

// Tokens whose presence in only one of a pair signals "different
// thing" — never auto-merge across these (a bandshell isn't a park).
const DISTINCT = new Set([
  "parking", "deck", "garage", "lot", "ramp",
  "trailhead", "overlook", "bandshell", "amphitheater", "amphitheatre",
  "annex", "branch", "suite", "ste", "unit", "bldg", "building",
  "field", "court", "rink", "pool", "stadium", "platform",
  "north", "south", "east", "west", "upper", "lower",
  "campus", "university", "college", "hospital", "clinic", "urgent",
  "orthopedics", "pediatrics", "outpatient", "pharmacy",
  "bookstore", "store", "shop", "playground", "pavilion", "pavillion",
  "visitor", "center", "armory", "manor",
  // Hotel brands: differentiate Homewood / Home2 / Hampton
  "home2", "homewood", "hampton", "fairfield", "courtyard", "marriott", "hilton",
]);

// "Low-information" CATEGORY words. They describe what KIND of place
// something is, not which one. Stripped from coreTokens so that two
// distinct salons sharing the word "salon" don't get scored as a
// shared core. Two SoulCycle locations sharing "soulcycle" still do.
// Kept separate from DISTINCT because a category word being missing
// from one side is NOT a conflict signal — it's just unmeasured info.
const CATEGORY_WORDS = new Set([
  "salon", "spa", "wellness", "yoga", "pilates", "fitness", "gym",
  "studio", "school", "academy", "training",
  "church", "ministry", "ministries", "fellowship", "congregation",
  "temple", "mosque", "synagogue", "lodge", "club", "association",
  "society", "foundation",
  "boutique", "barber", "nails", "beauty",
  "restaurant", "cafe", "café", "bistro", "diner", "eatery", "tavern",
  "pub", "grill", "kitchen", "bar", "pizzeria",
  "service", "services", "consulting", "consultants",
  "medical", "dental", "therapy", "acupuncture", "chiropractic",
]);

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[’']s\b/g, "s")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return norm(s).split(" ").filter((t) => t && !STOPWORDS.has(t));
}

function coreTokens(s: string): string[] {
  // Core = name tokens minus DISTINCT (sub-feature words) minus
  // CATEGORY_WORDS (low-info "what kind of place" words). What's
  // left is the actual identifying brand/proper-noun stem —
  // "maxwells" instead of "maxwells kitchen", "smoketown" instead
  // of "smoketown brewing", "starbucks" instead of "starbucks
  // coffee company". Two records that share a core token after
  // this filter are sharing a real identifier, not a category.
  return tokens(s).filter((t) => !DISTINCT.has(t) && !CATEGORY_WORDS.has(t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function distinctConflict(a: string[], b: string[]): boolean {
  const A = new Set(a);
  const B = new Set(b);
  for (const t of DISTINCT) {
    if (A.has(t) !== B.has(t)) return true;
  }
  return false;
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

type Pair = {
  a: { slug: string; name: string };
  b: { slug: string; name: string };
  municipality: string;
  jaccard: number;
  meters: number;
  coreOverlap: number;
  conflict: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

function classify(p: Omit<Pair, "confidence">): Pair["confidence"] {
  if (p.conflict) return "LOW";
  // HIGH: very confident, safe to auto-merge.
  //   - ≥ 2 shared core tokens + same building (≤ 60 m) + jaccard ≥ 0.4
  //   - OR very high name match (jaccard ≥ 0.75) + close (≤ 100 m)
  // MEDIUM: needs human review — looks like same place but signals
  //   could be coincidental.
  //   - Same building + 1 shared core token + jaccard ≥ 0.25
  //     (catches Maxwell's Kitchen / Maxwell's Burgers & Shakes —
  //     same brand stem only, but at identical coordinates)
  //   - Or 0.6+ jaccard within 300 m
  if (p.coreOverlap >= 2 && p.meters <= 60 && p.jaccard >= 0.4) return "HIGH";
  if (p.jaccard >= 0.75 && p.meters <= 100) return "HIGH";
  if (p.meters <= 25 && p.coreOverlap >= 1 && p.jaccard >= 0.25) return "MEDIUM";
  if (p.jaccard >= 0.6 && p.meters <= 300) return "MEDIUM";
  return "LOW";
}

function main() {
  const apply = process.argv.includes("--auto-merge");
  const places = publicPlaces();
  const tokenized = places.map((p) => ({
    slug: p.slug,
    name: p.name,
    geom: p.geom,
    municipality: p.municipality || "",
    tok: tokens(p.name),
    core: coreTokens(p.name),
  }));

  const pairs: Pair[] = [];
  for (let i = 0; i < tokenized.length; i++) {
    for (let j = i + 1; j < tokenized.length; j++) {
      const a = tokenized[i];
      const b = tokenized[j];
      if (a.municipality !== b.municipality) continue;
      const A = new Set(a.tok);
      const B = new Set(b.tok);
      const sim = jaccard(A, B);
      const d =
        a.geom && b.geom ? haversineMeters(a.geom, b.geom) : Number.POSITIVE_INFINITY;
      // Admission gate: needs a meaningful overlap signal. We
      // *consider* a pair if its name overlap is at least loose
      // (jaccard ≥ 0.25) AND it's in the same town within 500 m.
      // The classifier below decides confidence tier. Pairs at
      // 0 m with totally different names (jaccard < 0.25, e.g.
      // salon + laundromat sharing a centroid fallback) are dropped
      // before they even reach scoring — that was the false-positive
      // explosion when the gate was geographic-only.
      if (sim < 0.25) continue;
      if (d > 500) continue;
      const coreA = new Set(a.core);
      const coreB = new Set(b.core);
      let coreOverlap = 0;
      for (const t of coreA) if (coreB.has(t)) coreOverlap++;
      const conflict = distinctConflict(a.tok, b.tok);
      const base: Omit<Pair, "confidence"> = {
        a: { slug: a.slug, name: a.name },
        b: { slug: b.slug, name: b.name },
        municipality: a.municipality,
        jaccard: Number(sim.toFixed(3)),
        meters: Math.round(d),
        coreOverlap,
        conflict,
      };
      pairs.push({ ...base, confidence: classify(base) });
    }
  }

  pairs.sort((x, y) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return order[x.confidence] - order[y.confidence] || x.meters - y.meters;
  });

  const buckets = {
    HIGH: pairs.filter((p) => p.confidence === "HIGH"),
    MEDIUM: pairs.filter((p) => p.confidence === "MEDIUM"),
    LOW: pairs.filter((p) => p.confidence === "LOW"),
  };

  console.log(
    `find-duplicates: scanned ${places.length} places — ` +
      `${buckets.HIGH.length} high, ${buckets.MEDIUM.length} medium, ${buckets.LOW.length} low.`,
  );

  if (buckets.HIGH.length > 0) {
    console.log("\nHIGH confidence (auto-mergeable):");
    for (const p of buckets.HIGH) {
      console.log(
        `  ${p.a.slug}  +  ${p.b.slug}  (${p.meters}m, jaccard ${p.jaccard}, core ${p.coreOverlap})`,
      );
      console.log(`    "${p.a.name}"  ↔  "${p.b.name}"`);
    }
  }

  if (buckets.MEDIUM.length > 0) {
    console.log("\nMEDIUM confidence (needs review):");
    for (const p of buckets.MEDIUM) {
      console.log(
        `  ${p.a.slug}  +  ${p.b.slug}  (${p.meters}m, jaccard ${p.jaccard})`,
      );
      console.log(`    "${p.a.name}"  ↔  "${p.b.name}"`);
    }
  }

  const reportPath = join(process.cwd(), "scripts/find-duplicates-report.json");
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        scanned: places.length,
        counts: {
          high: buckets.HIGH.length,
          medium: buckets.MEDIUM.length,
          low: buckets.LOW.length,
        },
        pairs,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nReport written: ${reportPath}`);

  if (apply) {
    const decisionsPath = join(process.cwd(), "src/data/dedup-decisions.json");
    type Decisions = { reject?: string[]; merge?: string[] };
    const current: Decisions = existsSync(decisionsPath)
      ? JSON.parse(readFileSync(decisionsPath, "utf8"))
      : { reject: [], merge: [] };
    const merge = new Set(current.merge ?? []);
    let added = 0;
    for (const p of buckets.HIGH) {
      const key = [p.a.slug, p.b.slug].sort().join("|");
      if (!merge.has(key)) {
        merge.add(key);
        added++;
      }
    }
    const out: Decisions = {
      reject: current.reject ?? [],
      merge: [...merge].sort(),
    };
    writeFileSync(decisionsPath, JSON.stringify(out, null, 2) + "\n");
    console.log(
      `\nAuto-merge: added ${added} HIGH-confidence pair(s) to ${decisionsPath}`,
    );
    console.log(`Total merge decisions now: ${out.merge!.length}`);
  } else {
    console.log("\nRun with --auto-merge to write HIGH pairs into dedup-decisions.json");
  }
}

main();
