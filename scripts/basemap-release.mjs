#!/usr/bin/env node

import {
  BASEMAP_RELEASE_MANIFEST_PATH,
  loadBasemapRelease,
  refreshBasemapRelease,
  repositoryRootFromBasemapModule,
  verifyBasemapRelease,
  writeBasemapRelease,
} from "./lib/basemap-release.mjs";
import {
  loadDataRelease,
  refreshDataReleaseStream,
  writeDataRelease,
} from "./lib/data-release.mjs";

const root = repositoryRootFromBasemapModule();
const args = process.argv.slice(2);
let manifest = loadBasemapRelease(root);

if (args.includes("--write")) {
  const releaseFlag = args.indexOf("--release-id");
  const releaseId = releaseFlag >= 0 ? args[releaseFlag + 1] : null;
  if (!releaseId) {
    console.error("basemap-release: --write requires --release-id <id>");
    process.exit(1);
  }
  manifest = await refreshBasemapRelease(manifest, releaseId, root);
  writeBasemapRelease(manifest, root);
  const dataRelease = refreshDataReleaseStream(
    loadDataRelease(root),
    "basemap",
    root,
    manifest.promoted_at,
  );
  writeDataRelease(dataRelease, root);
  console.log(
    `basemap-release: refreshed ${BASEMAP_RELEASE_MANIFEST_PATH} and ` +
    "the basemap data-release stream",
  );
}

const result = await verifyBasemapRelease(manifest, root);
if (result.errors.length > 0) {
  console.error(`basemap-release: validation failed (${result.errors.length})`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `basemap-release: ${manifest.release_id} is present and verified ` +
  `(${manifest.assets.length} artifacts; no network used)`,
);
