/**
 * Ingest the Frederick County Parks & Rec amenity locations into a
 * staging file — DRY RUN by design. Writes src/data/rec-locations.json
 * (203 amenity points + photo URLs) and prints a summary. Does NOT touch
 * places-client.json / the live place set; folding these into the place
 * spine (category mapping, dedupe vs fcParks polygons, municipality
 * resolution) is a reviewed follow-up.
 *
 *   npm run ingest:rec        # (add to package.json scripts)
 *   tsx --tsconfig tsconfig.json scripts/ingest-rec-locations.ts
 *
 * Optional: pass --photos <dir> to also download every photo locally
 * (for later mirroring to Vercel blob, matching the existing place-photo
 * pipeline). Off by default — 203 PNGs (~70MB) should not land in git.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fetchRecLocations, type RecLocation } from "@/lib/integrations/fcRecLocations";

const OUT = new URL("../src/data/rec-locations.json", import.meta.url).pathname;

async function main() {
  const recs = await fetchRecLocations();
  if (!recs.length) {
    console.error("  No features returned — feed unreachable from here? (Vercel can reach ArcGIS; local CI often can't.)");
    process.exit(1);
  }

  writeFileSync(OUT, JSON.stringify(recs));

  const byKind: Record<string, number> = {};
  let withPhoto = 0;
  for (const r of recs) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    if (r.photoUrl) withPhoto++;
  }

  console.log(`\n  Ingested ${recs.length} rec locations → src/data/rec-locations.json`);
  console.log("  by kind:", Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));
  console.log(`  with photo: ${withPhoto}/${recs.length}`);

  // Honest flags for the reviewed merge step:
  const passports = recs.filter((r) => r.kind === "passport").length;
  const dogParks = recs.filter((r) => /dog\s*park/i.test(r.name));
  console.log(`  Wegmans Passport markers: ${passports} (powers the self-guided passport feature)`);
  console.log(`  dog-park named entries: ${dogParks.length}${dogParks.length ? " — " + dogParks.map((d) => d.name).join(", ") : ""}`);

  if (process.argv.includes("--photos")) {
    const dir = process.argv[process.argv.indexOf("--photos") + 1] ?? "/tmp/rec-photos";
    await downloadPhotos(recs, dir);
  } else {
    console.log("  (photos left as URLs; pass --photos <dir> to download for blob mirroring)\n");
  }
}

async function downloadPhotos(recs: RecLocation[], dir: string) {
  mkdirSync(dir, { recursive: true });
  let ok = 0;
  for (const r of recs) {
    if (!r.photoUrl) continue;
    try {
      const res = await fetch(r.photoUrl);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(`${dir}/${r.id}.png`, buf);
      ok++;
    } catch {
      /* skip on error */
    }
  }
  console.log(`  downloaded ${ok} photos → ${dir}\n`);
}

main();
