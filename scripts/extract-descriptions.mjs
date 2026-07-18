/**
 * extract-descriptions — rewrite the thin/placeholder place blurbs.
 *
 * The catalog's #1 visible quality problem (measured 2026-05-30): ~56% of
 * places have a blurb under 40 chars, and ~41% are placeholder/address
 * fragments like "Wastlers' Barber Shop 48 N Market St" or "Coffee in
 * Thurmont". That single thing makes a healthy catalog READ like a raw
 * database. This synthesizes a real one-sentence description from signal
 * we already paid Google for (editorial_summary + a top review snippet),
 * via the same Vercel AI Gateway + gpt-4o-mini + Zod pattern as
 * extract-known-for.mjs.
 *
 * Discipline (matches known-for):
 *  - Idempotent: skips places already done unless --force.
 *  - Surgical: ONLY rewrites blurbs that are missing, < 40 chars, or match
 *    the "<Name> <address>" / "<Category> in <Town>" placeholder shapes.
 *    NEVER touches a curated seed/manual blurb.
 *  - Never fabricates: returns null when the signal is too thin to write
 *    a truthful sentence (the place keeps its current blurb).
 *  - Output to src/data/descriptions.json (slug -> { blurb, source }),
 *    merged by the client-places build through data:review, so a human
 *    spot-checks before it ships. Run `npm run style:lint` on the output.
 *
 * Run:  vc env pull && node scripts/extract-descriptions.mjs --limit=200
 *       node scripts/extract-descriptions.mjs --force        (redo all)
 * Needs: VERCEL_OIDC_TOKEN (AI Gateway) — same as extract-known-for.
 */
import fs from "node:fs";
import path from "node:path";
import { generateObject } from "ai";
import { z } from "zod";

const ROOT = path.resolve(import.meta.dirname, "..");
const PLACES = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/places-client.json"), "utf8"));
const ENR = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/places-enrichment.json"), "utf8"));
const OUT_PATH = path.join(ROOT, "src/data/descriptions.json");

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const LIMIT = (() => {
  const a = [...args].find((x) => x.startsWith("--limit="));
  return a ? parseInt(a.split("=")[1], 10) : Infinity;
})();

if (!process.env.VERCEL_OIDC_TOKEN) {
  console.error("ERR: VERCEL_OIDC_TOKEN missing. Run `vc env pull` first.");
  process.exit(1);
}

const placesArr = Array.isArray(PLACES) ? PLACES : PLACES.places;

/** A blurb is "weak" (eligible for rewrite) when it's missing, short, or
 *  looks like an address/name fragment or a "<Category> in <Town>"
 *  placeholder. Curated blurbs (real sentences ending in a period, 40+
 *  chars, not address-shaped) are left untouched. */
function isWeakBlurb(p) {
  const b = (p.short_blurb || "").trim();
  if (!b || b.length < 40) return true;
  if (/\b(St|Ave|Rd|Blvd|Dr|Ln|Ct|Way|Hwy|Street|Avenue|Road)\b\.?\s*$/i.test(b)) return true;
  if (/^\d/.test(b)) return true; // starts with a street number
  if (/^[A-Za-z .'&-]+\s+(in|of)\s+[A-Z][a-z]+\.?$/.test(b)) return true; // "Coffee in Thurmont"
  return false;
}

const ResultSchema = z.object({
  blurb: z
    .string()
    .min(40)
    .max(160)
    .nullable()
    .describe(
      "ONE plain, true sentence describing this place for a local guide — what it is and why someone goes. " +
        "No marketing fluff, no banned words (discover, hidden gem, curated, quaint, charming, nestled), no em dashes. " +
        "End with a period. Return null if the signal is too thin to write something truthful.",
    ),
});

async function writeOne(name, category, town, editorial, review) {
  const { object } = await generateObject({
    model: "openai/gpt-4o-mini",
    schema: ResultSchema,
    prompt: `Write a one-sentence description for a local civic guide.

PLACE: "${name}" — category: ${category}${town ? `, in ${town}` : ""}
GOOGLE_EDITORIAL_SUMMARY: ${editorial || "(none)"}
TOP_REVIEW_SNIPPET: ${review || "(none)"}

Rules:
- ONE sentence, 40-160 chars, ending in a period.
- Describe what the place IS and why a local goes there. Concrete, not generic ("good place to visit" is banned).
- Synthesize from the signal; do NOT quote the review verbatim or use first person.
- Plain and honest. No marketing voice. Banned words: discover, hidden gem, curated, quaint, charming, nestled, vibrant. No em dashes.
- Do not pad the sentence with a three-part list. Include only facts that help someone decide whether to go.
- If the editorial + review are both empty or too thin to say anything true and specific, return blurb: null. Never invent facts.`,
  });
  return object.blurb;
}

async function main() {
  let existing = {};
  if (fs.existsSync(OUT_PATH) && !FORCE) {
    try { existing = JSON.parse(fs.readFileSync(OUT_PATH, "utf8")); } catch {}
  }

  const eligible = placesArr.filter((p) => isWeakBlurb(p) && (FORCE || !existing[p.slug]));
  const todo = eligible.slice(0, LIMIT);
  console.log(`${eligible.length} weak blurbs; rewriting ${todo.length} this run (limit ${LIMIT}).`);

  let written = 0, skipped = 0;
  for (const p of todo) {
    const e = ENR[p.slug] || {};
    if (!e.editorial_summary && !e.review_snippet) { skipped++; continue; }
    try {
      const blurb = await writeOne(p.name, p.category, p.city || p.municipality, e.editorial_summary, e.review_snippet);
      if (!blurb) { skipped++; continue; }
      existing[p.slug] = { blurb, source: "ai-gpt4o-mini" };
      written++;
      if (written % 25 === 0) console.log(`  …${written} written`);
    } catch (err) {
      console.log(`  ✗ ${p.slug}: ${err.message?.slice(0, 80)}`);
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2) + "\n");
  console.log(`\nDone. +${written} blurbs, ${skipped} skipped (thin signal), ${Object.keys(existing).length} total → src/data/descriptions.json`);
  console.log(`Next: review the file, run \`npm run style:lint\`, then wire into the client-places build.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
