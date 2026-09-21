/**
 * Manually promote an explicitly reviewed, owner-authorized public Fair layout.
 * This is not called by the recurring collector, a build, or a workflow.
 *
 * npx tsx scripts/import-fair-layout.ts --candidate scripts/reports/fair-data/candidate-latest.json \
 *   --source-directory /private/tmp --owner-permission-2026-09-21 --write
 *
 * The source directory must hold original fair-floorplan-{mapId}.html/.png files.
 * No fetches, transformations, or private exhibitor fields are permitted here.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

import { buildPublicFairLayout, fairLayoutArtworkSource, FAIR_LAYOUT_SECTIONS } from "./lib/fair-layout-import";

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  if (!args.includes("--owner-permission-2026-09-21")) {
    throw new Error("This manual release requires the recorded September 21 owner permission attestation.");
  }
  const candidatePath = flag("--candidate");
  const sourceDirectory = flag("--source-directory");
  if (!candidatePath || !sourceDirectory) throw new Error("Pass --candidate and --source-directory.");
  const candidateBytes = await readFile(resolve(candidatePath));
  const candidate = JSON.parse(candidateBytes.toString("utf8"));
  const htmlByMapId: Record<string, string> = {};
  const artworkByMapId: Record<string, { width: number; height: number }> = {};
  const images: { mapId: string; bytes: Buffer; width: number; height: number; sourceUrl: string }[] = [];
  for (const mapId of Object.keys(FAIR_LAYOUT_SECTIONS)) {
    const html = await readFile(resolve(sourceDirectory, `fair-floorplan-${mapId}.html`), "utf8");
    const bytes = await readFile(resolve(sourceDirectory, `fair-floorplan-${mapId}.png`));
    if (Buffer.byteLength(html) > 5_000_000 || bytes.length > 10_000_000) throw new Error("Oversized Fair source.");
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
      throw new Error(`Map ${mapId} must have a single original PNG background.`);
    }
    htmlByMapId[mapId] = html;
    artworkByMapId[mapId] = { width: metadata.width, height: metadata.height };
    const sourceMap = candidate.eventHub.maps.find((map: { mapId: string }) => map.mapId === mapId);
    images.push({ mapId, bytes, ...artworkByMapId[mapId], sourceUrl: fairLayoutArtworkSource(sourceMap.backgroundImageUrl) });
  }
  const reviewedAt = new Date().toISOString();
  const layout = buildPublicFairLayout(candidate, htmlByMapId, artworkByMapId, reviewedAt);
  const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
  const manifest = {
    reviewedAt,
    sourceCheckedAt: layout.checkedAt,
    permission: { ...layout.permission, evidence: "Owner stated 'i have permission - lets do it' in the September 21, 2026 task. This is an owner attestation, not an independently verified license or newly obtained organizer export." },
    candidateSha256: sha256(candidateBytes),
    reviewedSourceFingerprints: candidate.reviewGate.fingerprints,
    sourceReviewAlerts: candidate.reviewGate.alerts,
    scope: "Only the exhibitor/floorplan subset was promoted. The recurring collector and its review gate remain unchanged. No schedule, private contact, transaction, registration, imagery from vendor profiles, or business operating status is included.",
    annotationReview: "The explicit 'Click to edit' editor residue was omitted. All other source labels are preserved with their source font sizes, including zero-sized invisible text. Annotation coordinates include source text padding. Background artwork is original, unedited PNG data rendered at source canvas width with its intrinsic aspect ratio. Booth rotation origin is top left.",
    maps: images.map((image) => ({
      mapId: image.mapId,
      sourceUrl: image.sourceUrl,
      sourceHtmlSha256: sha256(htmlByMapId[image.mapId]),
      artworkSha256: sha256(image.bytes),
      artworkBytes: image.bytes.length,
      artworkWidth: image.width,
      artworkHeight: image.height,
      canvasWidth: layout.maps.find((map) => map.id === image.mapId)!.width,
      canvasHeight: layout.maps.find((map) => map.id === image.mapId)!.height,
      boothCount: layout.maps.find((map) => map.id === image.mapId)!.booths.length,
      rotatedBoothCount: layout.maps.find((map) => map.id === image.mapId)!.booths.filter((booth) => booth.rotationDeg !== 0).length,
      unlabeledBoothIds: layout.maps.find((map) => map.id === image.mapId)!.booths.filter((booth) => !booth.label).map((booth) => booth.id),
    })),
  };
  if (args.includes("--write")) {
    const outputDirectory = resolve("public/fair/layouts");
    await mkdir(outputDirectory, { recursive: true });
    for (const image of images) await writeFile(resolve(outputDirectory, `fair-floorplan-${image.mapId}.png`), image.bytes);
    await writeFile(resolve(outputDirectory, "great-frederick-fair-2026.json"), `${JSON.stringify(layout)}\n`);
    await writeFile(resolve("docs/audits/2026-09-21-fair-layout-release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`${args.includes("--write") ? "Wrote" : "Validated"} reviewed Fair layout: ${layout.maps.length} sections, ${layout.maps.reduce((sum, map) => sum + map.booths.length, 0)} shapes, ${layout.vendors.length} exhibitors, ${layout.vendors.reduce((sum, vendor) => sum + vendor.boothIds.length, 0)} matched references. ${images.reduce((sum, image) => sum + image.bytes.length, 0)} original artwork bytes.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
