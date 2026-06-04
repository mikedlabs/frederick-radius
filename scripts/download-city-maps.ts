/**
 * Download the City of Frederick PDF maps catalogued in city-maps.ts and
 * (optionally) mirror them to Vercel blob, the same hosting path the
 * place photos use. The ~67 MB of binaries never belong in git, so this
 * fetches them to a working dir; with BLOB_READ_WRITE_TOKEN set and
 * --upload, it also pushes to blob and prints the hosted URLs to paste
 * back into city-maps.ts (`blobUrl`).
 *
 *   tsx scripts/download-city-maps.ts              # → ./.city-maps/
 *   tsx scripts/download-city-maps.ts --upload     # → blob (needs token)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { CITY_MAPS } from "@/data/city-maps";

const DIR = process.env.OUT_DIR ?? "./.city-maps";

async function main() {
  mkdirSync(DIR, { recursive: true });
  const upload = process.argv.includes("--upload");
  let put: typeof import("@vercel/blob").put | null = null;
  if (upload) {
    try {
      ({ put } = await import("@vercel/blob"));
    } catch {
      console.error("  @vercel/blob not available — run without --upload to just download.");
      process.exit(1);
    }
  }

  let ok = 0;
  for (const m of CITY_MAPS) {
    try {
      const res = await fetch(m.sourceUrl, { redirect: "follow" });
      if (!res.ok) { console.warn(`  ✗ ${m.id} (${res.status})`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(`${DIR}/${m.id}.pdf`, buf);
      ok++;
      if (put) {
        const { url } = await put(`city-maps/${m.id}.pdf`, buf, { access: "public", contentType: "application/pdf" });
        console.log(`  ✓ ${m.id.padEnd(26)} ${url}`);
      } else {
        console.log(`  ✓ ${m.id.padEnd(26)} ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
      }
    } catch (e) {
      console.warn(`  ✗ ${m.id}: ${(e as Error).message}`);
    }
  }
  console.log(`\n  ${ok}/${CITY_MAPS.length} maps ${put ? "mirrored to blob" : `saved to ${DIR}`}.\n`);
}

main();
