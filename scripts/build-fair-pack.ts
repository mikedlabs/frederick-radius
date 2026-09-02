import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { greatFrederickFair2026Offers } from "../src/data/fair/great-frederick-fair-2026-offers";
import { greatFrederickFair2026 } from "../src/data/fair/great-frederick-fair-2026";
import {
  GREAT_FREDERICK_FAIR_2026_EXPECTED_DAYS,
  GREAT_FREDERICK_FAIR_2026_EXPECTED_ROWS,
  MAX_FAIR_PACK_BYTES,
  createFairPack,
  fairPackPointerSchema,
  type FairPackPayload,
} from "../src/lib/fair/pack";
import {
  GREAT_FREDERICK_FAIR_2026_END_DATE,
  GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL,
  GREAT_FREDERICK_FAIR_2026_START_DATE,
  parseGreatFrederickFair2026Schedule,
} from "../src/lib/fair/schedule";
import { buildGreatFrederickFairTransitEvidence } from "../src/lib/fair/transit";

const root = process.cwd();
const scheduleInputPath = resolve(
  root,
  "src/lib/fair/__fixtures__/great-frederick-fair-2026.ics",
);
const releaseDirectory = resolve(root, "public/fair/2026/releases");
const currentPath = resolve(root, "public/fair/2026/current.json");
const descriptorPath = resolve(
  root,
  "src/data/fair/great-frederick-fair-2026-pack.ts",
);

const parsedSchedule = parseGreatFrederickFair2026Schedule(
  readFileSync(scheduleInputPath, "utf8"),
);
if (!parsedSchedule.ok || !parsedSchedule.sourceRevision) {
  const messages = parsedSchedule.diagnostics
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join("\n");
  throw new Error(`Fair schedule validation failed.\n${messages}`);
}
if (
  parsedSchedule.stats.dayCount !== GREAT_FREDERICK_FAIR_2026_EXPECTED_DAYS ||
  parsedSchedule.stats.itemCount !== GREAT_FREDERICK_FAIR_2026_EXPECTED_ROWS
) {
  throw new Error(
    `Refusing to publish ${parsedSchedule.stats.dayCount} Fair days and ${parsedSchedule.stats.itemCount} rows; expected 9 days and 190 rows.`,
  );
}

const transit = buildGreatFrederickFairTransitEvidence();
const uniqueSorted = (values: readonly string[]) =>
  Array.from(new Set(values)).sort();
const manifestSources = [
  ...greatFrederickFair2026.provenance,
  ...greatFrederickFair2026.days.flatMap((entity) => entity.provenance),
  ...greatFrederickFair2026.admissionTiers.flatMap(
    (entity) => entity.provenance,
  ),
  ...greatFrederickFair2026.scheduleItems.flatMap(
    (entity) => entity.provenance,
  ),
  ...greatFrederickFair2026.zones.flatMap((entity) => entity.provenance),
  ...greatFrederickFair2026.vendors.flatMap((entity) => entity.provenance),
  ...greatFrederickFair2026.facilities.flatMap((entity) => entity.provenance),
  ...greatFrederickFair2026.accessFacts.flatMap((entity) => entity.provenance),
  ...greatFrederickFair2026.lots.flatMap((entity) => entity.provenance),
];

const payload: FairPackPayload = {
  version: 1,
  fairId: greatFrederickFair2026.id,
  contentUpdatedAt: greatFrederickFair2026.updatedAt,
  manifest: greatFrederickFair2026,
  offers: greatFrederickFair2026Offers,
  schedule: {
    version: 1,
    startsOn: GREAT_FREDERICK_FAIR_2026_START_DATE,
    endsOn: GREAT_FREDERICK_FAIR_2026_END_DATE,
    source: {
      publisher: "The Great Frederick Fair",
      sourceTitle: "Official Fair schedule",
      sourceUrl: GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL,
      sourceRevision: parsedSchedule.sourceRevision,
    },
    stats: parsedSchedule.stats,
    days: parsedSchedule.days,
  },
  transit,
  provenance: {
    manifestSourceUrls: uniqueSorted(
      manifestSources.map((source) => source.sourceUrl),
    ),
    offerSourceUrls: uniqueSorted(
      greatFrederickFair2026Offers.flatMap((offer) =>
        offer.provenance.map((source) => source.sourceUrl),
      ),
    ),
    scheduleSourceUrl: GREAT_FREDERICK_FAIR_2026_SCHEDULE_SOURCE_URL,
    scheduleSourceRevision: parsedSchedule.sourceRevision,
    transitSourceUrl: transit.evidenceState.sourceUrl,
    transitFetchedOn: transit.evidenceState.sourceFetchedOn,
  },
};

async function writePack(): Promise<void> {
  const pack = await createFairPack(payload);
  const releaseText = `${JSON.stringify(pack, null, 2)}\n`;
  const releaseBytes = new TextEncoder().encode(releaseText).byteLength;
  if (releaseBytes > MAX_FAIR_PACK_BYTES) {
    throw new Error(
      `Fair pack is ${releaseBytes} bytes; the maximum is ${MAX_FAIR_PACK_BYTES}.`,
    );
  }

  const hash = pack.revision.slice("sha256:".length);
  const assetPath = `/fair/2026/releases/${hash}.json` as const;
  const releasePath = resolve(root, `public${assetPath}`);
  const pointer = fairPackPointerSchema.parse({
    version: 1,
    fairId: pack.fairId,
    revision: pack.revision,
    assetPath,
    byteLength: releaseBytes,
    contentUpdatedAt: pack.contentUpdatedAt,
    sourceRevision: pack.schedule.source.sourceRevision,
    dayCount: pack.schedule.stats.dayCount,
    itemCount: pack.schedule.stats.itemCount,
  });
  const pointerText = `${JSON.stringify(pointer, null, 2)}\n`;

  mkdirSync(releaseDirectory, { recursive: true });
  mkdirSync(dirname(descriptorPath), { recursive: true });
  writeFileSync(releasePath, releaseText, "utf8");
  writeFileSync(currentPath, pointerText, "utf8");
  writeFileSync(
    descriptorPath,
    `/* This file is generated by scripts/build-fair-pack.ts. Do not edit. */\n` +
      `import releaseJson from "../../../public${assetPath}";\n` +
      `import pointerJson from "../../../public/fair/2026/current.json";\n\n` +
      `import { parseFairPack, parseFairPackPointer } from "@/lib/fair/pack";\n\n` +
      `export const greatFrederickFair2026Pack = parseFairPack(releaseJson);\n` +
      `export const greatFrederickFair2026PackPointer = parseFairPackPointer(pointerJson);\n`,
    "utf8",
  );

  console.log(
    `Fair pack ${pack.revision}: ${pack.schedule.stats.dayCount} days, ${pack.schedule.stats.itemCount} rows, ${releaseBytes} bytes.`,
  );
}

void writePack().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
