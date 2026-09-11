/**
 * Category mis-tag cleanup generator (Photo Policy → trustworthy marks).
 *
 * DFP/Google bulk imports dump service/practitioner businesses into
 * DESTINATION categories — overwhelmingly `shopping` (a 562-record
 * catch-all) — so a physical therapist or barber ranks as a "thing to do"
 * and (once cards go typographic) wears a destination icon. These records
 * carry no Google primary_type, so the only signal is the name.
 *
 * This prints two lists for review:
 *   TIER A (deterministic, safe): high-precision practitioner/service
 *     names → reclassify to `wellness` (health/body) or `services`. These
 *     are added to places-overrides.json `patch` (the loader already
 *     applies category patches via patchRecord — no new code path).
 *   TIER B (needs human review): broad/ambiguous matches (LLC/Inc/Co/
 *     "studio"/"academy"/"day spa"…) that mix real services with legit
 *     retail (e.g. "Midar Fashion LLC") — NOT auto-applied.
 *
 * No deletions: records stay findable, just classified + promoted right.
 * Writes the Tier-A patches into places-overrides.json (preserving any
 * existing fold/remove/keepApart/patch) and the Tier-B queue to
 * docs/category-review-queue.md. Idempotent. Run:
 *   npx tsx scripts/build-category-overrides.ts
 */
import { publicPlaces } from "@/lib/loaders/places";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEST = new Set([
  "food","restaurant","coffee","bar","brewery","bakery","pizza","food-truck",
  "arts","museum","gallery","theater","music","public-art","park","trail",
  "outdoors","playground","family","shopping","antiques","book-store","market",
  "lodging","sports",
]);

// Health / body practitioners → wellness.
const HEALTH =
  /physical therap|physiotherap|chiropract|psycholog|psychiatr|psychotherap|counsel|behavioral health|\bdental\b|dentist|orthodont|optometr|dermatolog|acupunctur|\bmassage\b|aesthetics|med ?spa|medspa|pain management|dialysis/i;
// Other personal/office/home services → services.
const SERVICE =
  /\bsalon\b|barber|\bnails?\b|auto repair|auto body|transmission|\binsurance\b|\brealty\b|real estate|mortgage|\battorney\b|law (office|firm|group)|financial (center|advisor|group)|lawn ?care|landscap|plumbing|\bhvac\b|roofing|veterinar|driving school|personal train|crossfit/i;
// Broad suffixes that need human eyes (catch real retail too).
const AMBIGUOUS =
  /\bllc\b|\binc\b|\bco\.?$|services|academy|studio|consult|\bgym\b|fitness|travel|\bspa\b|agency/i;

type P = { slug: string; name: string; category: string };
const all = (publicPlaces() as P[]).filter((p) => DEST.has(p.category));

const tierA: Record<string, { category: string; from: string; name: string }> = {};
const tierB: Array<{ slug: string; name: string; category: string }> = [];

for (const p of all) {
  const name = p.name || "";
  if (HEALTH.test(name)) tierA[p.slug] = { category: "wellness", from: p.category, name };
  else if (SERVICE.test(name)) tierA[p.slug] = { category: "services", from: p.category, name };
  else if (AMBIGUOUS.test(name)) tierB.push({ slug: p.slug, name, category: p.category });
}

// ── Write Tier A into places-overrides.json (merge, preserve existing) ──
const OVERRIDES_PATH = resolve("src/data/places-overrides.json");
type OverridesFile = {
  fold?: Record<string, string>;
  remove?: string[];
  keepApart?: string[];
  patch?: Record<string, { name?: string; category?: string; short_blurb?: string }>;
};
const file = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8")) as OverridesFile;
const patch = { ...(file.patch ?? {}) };
for (const [slug, v] of Object.entries(tierA)) {
  // Preserve any hand-authored fields on an existing entry; set category.
  patch[slug] = { ...patch[slug], category: v.category };
}
// Deterministic key order so the diff is stable run-to-run.
const sortedPatch: typeof patch = {};
for (const k of Object.keys(patch).sort()) sortedPatch[k] = patch[k];
file.patch = sortedPatch;
writeFileSync(OVERRIDES_PATH, JSON.stringify(file, null, 2) + "\n");

// ── Write the Tier-B review queue to a doc ──
const queue = [
  "# Category review queue (Tier B)",
  "",
  "Ambiguous name matches the deterministic cleanup did NOT auto-apply —",
  "they mix real services with legit retail. Move the true services into",
  `places-overrides.json \`patch\` after review. ${tierB.length} records.`,
  "",
  "| current | name | slug |",
  "|---|---|---|",
  ...tierB.map((r) => `| ${r.category} | ${r.name.replace(/\|/g, "/")} | \`${r.slug}\` |`),
  "",
].join("\n");
writeFileSync(resolve("docs/category-review-queue.md"), queue);

console.log(`TIER A — wrote ${Object.keys(tierA).length} category overrides into places-overrides.json`);
for (const [slug, v] of Object.entries(tierA)) console.log(`  ${v.from.padEnd(9)} → ${v.category.padEnd(9)} ${v.name}  [${slug}]`);
console.log(`\nTIER B — wrote ${tierB.length} to docs/category-review-queue.md for human review`);
