/**
 * Enrich curated places with Google Places data → src/data/places-enrichment.json
 *
 * Cost control: by default enriches ONLY the curated editorial places
 * (source !== "dfp"), ~51 places, ~$2 one-time. DFP's 1,280 long-tail are
 * enriched on-demand elsewhere (when a user opens the sheet).
 *
 *   npm run enrich                 # curated only
 *   npm run enrich -- --limit 5    # smoke test
 *   npm run enrich -- --all        # everything ($$)
 *
 * Resolution: google_place_id when present (cheap), else Text Search by
 * "name, address" biased to the place's coordinates.
 */
import { writeFileSync } from "node:fs";
import { PLACES } from "@/data/places";
import {
  getPlaceDetails,
  resolveAndEnrich,
  type PlaceEnrichment,
} from "@/lib/integrations/google-places";

const OUT = new URL("../src/data/places-enrichment.json", import.meta.url).pathname;

async function main() {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY not set. Run: vercel env pull .env.local");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const li = args.indexOf("--limit");
  const limit = li >= 0 ? parseInt(args[li + 1], 10) : Infinity;

  let targets = PLACES.filter((p) => all || p.source !== "dfp");
  if (Number.isFinite(limit)) targets = targets.slice(0, limit);

  console.log(`Enriching ${targets.length} places (${all ? "ALL incl. DFP $$" : "curated only"})…`);

  const out: Record<string, PlaceEnrichment & { enriched_at: string }> = {};
  let ok = 0, closed = 0, miss = 0;
  const t0 = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    let data: PlaceEnrichment | null = null;
    if (p.google_place_id && /^ChIJ/.test(p.google_place_id)) {
      data = await getPlaceDetails(p.google_place_id);
    } else {
      data = await resolveAndEnrich({
        name: p.name,
        address: `${p.address}, ${p.city}, MD`,
        lat: p.geom?.lat,
        lng: p.geom?.lng,
      });
    }
    if (!data) {
      miss++;
    } else {
      out[p.slug] = { ...data, enriched_at: new Date().toISOString() };
      ok++;
      if (data.business_status === "CLOSED_PERMANENTLY") closed++;
    }
    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      console.log(`  ${i + 1}/${targets.length} · ok:${ok} closed:${closed} miss:${miss}`);
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  writeFileSync(OUT, JSON.stringify(out, null, 0));
  console.log(`\nWrote ${OUT}`);
  console.log(`Enriched ${ok} · permanently-closed ${closed} · no-match ${miss}`);
  console.log(`Took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const closedSlugs = Object.entries(out)
    .filter(([, v]) => v.business_status === "CLOSED_PERMANENTLY")
    .map(([k]) => k);
  if (closedSlugs.length) {
    console.log(`\n⚠ Permanently closed (review for removal):\n  ${closedSlugs.join("\n  ")}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
