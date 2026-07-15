/**
 * category-audit.ts — flag likely-miscategorized places for human review.
 *
 * "Ensure everything is correct" without trusting any single signal blindly:
 * it compares each place's ASSIGNED category (post-overrides, from the live
 * client set) against two independent signals —
 *   1. Google's own `primary_type` (places-enrichment.json), mapped to our
 *      category vocabulary (high-confidence types only), and
 *   2. strong NAME keywords (orchard, distillery, museum, …).
 * A place is flagged only when a signal CONFIDENTLY disagrees with its current
 * category. Output is a review sheet (docs/category-audit.md); fixes are applied
 * BY HAND to places-overrides.json `patch` (the human layer that already wins),
 * never auto-written — the same boundary-correction discipline the app uses.
 *
 *   npm run audit:categories   → docs/category-audit.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
type Place = { slug: string; name: string; category: string };
const places: Place[] = (() => {
  const raw = JSON.parse(readFileSync(resolve(ROOT, "src/data/places-client.json"), "utf8"));
  return Array.isArray(raw) ? raw : raw.places ?? [];
})();
const enrichment: Record<string, { primary_type?: string }> =
  JSON.parse(readFileSync(resolve(ROOT, "src/data/places-enrichment.json"), "utf8"));

// Google primary_type → our category. HIGH-CONFIDENCE only: ambiguous Google
// types (service, store, establishment, point_of_interest, …) are intentionally
// omitted so the audit stays low-noise.
const TYPE_MAP: Record<string, string> = {
  church: "worship", synagogue: "worship", mosque: "worship", place_of_worship: "worship",
  park: "park", national_park: "park", state_park: "park", dog_park: "park",
  hiking_area: "trail",
  restaurant: "restaurant", american_restaurant: "restaurant", pizza_restaurant: "pizza",
  bakery: "bakery", coffee_shop: "coffee", cafe: "coffee",
  bar: "bar", pub: "bar", wine_bar: "bar",
  brewery: "brewery", winery: "winery", distillery: "distillery",
  ice_cream_shop: "ice-cream", frozen_yogurt_shop: "ice-cream", dessert_shop: "ice-cream", dessert_restaurant: "ice-cream", candy_store: "ice-cream", chocolate_shop: "ice-cream",
  museum: "museum", art_gallery: "gallery", performing_arts_theater: "theater",
  hotel: "lodging", motel: "lodging", bed_and_breakfast: "lodging", lodging: "lodging",
  book_store: "book-store", library: "library",
  farm: "agritourism", farmstay: "agritourism", orchard: "agritourism",
  farmers_market: "market", market: "market",
  pharmacy: "pharmacy", drugstore: "pharmacy",
  hardware_store: "hardware",
  gym: "wellness", fitness_center: "wellness", yoga_studio: "yoga", spa: "wellness",
  golf_course: "golf",
  parking: "parking", train_station: "transit", transit_station: "transit", bus_station: "transit",
};

// Strong NAME signals (catch places with no enrichment, or where Google's type
// is generic). Order matters — first match wins.
const NAME_RULES: Array<{ re: RegExp; cat: string }> = [
  { re: /\b(orchard|pick[- ]?your[- ]?own|\bpyo\b|petting farm|corn maze|pumpkin patch|christmas tree farm|berry farm|farm stand|u-pick)\b/i, cat: "agritourism" },
  { re: /\b(ice cream|gelato|frozen yogurt|froyo|frozen custard|snowball|snoballs?|soft serve|baskin|cold stone|rita'?s|bruster'?s|dairy queen)\b/i, cat: "ice-cream" },
  { re: /\b(distiller|distilling)\b/i, cat: "distillery" },
  { re: /\b(winer|vineyard|cidery|ciderworks|meadery)\b/i, cat: "winery" },
  { re: /\b(brewer|brewing|taproom|tap room)\b/i, cat: "brewery" },
  { re: /\b(museum)\b/i, cat: "museum" },
  { re: /\b(golf club|golf course|country club|golf links)\b/i, cat: "golf" },
  { re: /\b(library)\b/i, cat: "library" },
  { re: /\b(pharmacy|drug store)\b/i, cat: "pharmacy" },
];

type Flag = { slug: string; name: string; current: string; suggest: string; why: string };
const flags: Flag[] = [];

// Human-reviewed cases where a strong machine signal describes a secondary
// trait rather than the listing's best primary category. Keeping these here
// makes future audits useful instead of repeatedly resurfacing known noise.
const REVIEWED_EXCEPTIONS = new Set([
  "fingerboard-country-inn-new-market:agritourism", // a farmstay, primarily lodging
  "the-orchard-frederick:agritourism", // restaurant name, not an orchard attraction
  "brewers-alley-frederick:brewery", // brewpub whose primary discovery use is restaurant
  "cafe-nola:coffee", // full-service bistro; coffee remains a secondary tag
  "schroyers-tavern-at-maryland-national-golf-club-middletown:golf", // restaurant at a course
  "urbana-library-farmers-market-new-market:library", // market hosted at the library
  "best-kept-secret-hair-salon:wellness", // hair salon; spa is a secondary Google type
  "quince-orchard-psychotherapy:agritourism", // mental-health practice whose brand contains Orchard
]);

for (const p of places) {
  const pt = enrichment[p.slug]?.primary_type;
  const typeSuggest = pt ? TYPE_MAP[pt] : undefined;
  if (
    typeSuggest &&
    typeSuggest !== p.category &&
    !REVIEWED_EXCEPTIONS.has(`${p.slug}:${typeSuggest}`)
  ) {
    flags.push({ slug: p.slug, name: p.name, current: p.category, suggest: typeSuggest, why: `Google primary_type = ${pt}` });
    continue; // one flag per place; type signal is strongest
  }
  for (const r of NAME_RULES) {
    if (
      r.re.test(p.name) &&
      r.cat !== p.category &&
      !REVIEWED_EXCEPTIONS.has(`${p.slug}:${r.cat}`)
    ) {
      flags.push({ slug: p.slug, name: p.name, current: p.category, suggest: r.cat, why: `name matches /${r.re.source.slice(0, 40)}…/` });
      break;
    }
  }
}

// Group by suggested category for an easy review pass.
const byTarget = new Map<string, Flag[]>();
for (const f of flags) {
  if (!byTarget.has(f.suggest)) byTarget.set(f.suggest, []);
  byTarget.get(f.suggest)!.push(f);
}

const lines: string[] = [
  "# Category audit — likely miscategorized places",
  "",
  `Generated by \`npm run audit:categories\`. ${flags.length} flag(s) across ${places.length} places.`,
  "Each is a SUGGESTION from Google's primary_type or a strong name keyword — review by",
  "eye and apply confirmed fixes to `src/data/places-overrides.json` `patch`",
  '(`"slug": { "category": "..." }`). Patches win over automated categorization.',
  "",
];
for (const [target, fs2] of [...byTarget.entries()].sort((a, b) => b[1].length - a[1].length)) {
  lines.push(`## → suggest \`${target}\` (${fs2.length})`, "");
  lines.push("| slug | name | current | why |", "| --- | --- | --- | --- |");
  for (const f of fs2.sort((a, b) => a.current.localeCompare(b.current))) {
    lines.push(`| \`${f.slug}\` | ${f.name} | \`${f.current}\` | ${f.why} |`);
  }
  lines.push("");
}
writeFileSync(resolve(ROOT, "docs/category-audit.md"), lines.join("\n"));
console.log(`wrote docs/category-audit.md — ${flags.length} flags`);
// Console summary by target.
for (const [t, fs2] of [...byTarget.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(String(fs2.length).padStart(4), "→", t);
}
