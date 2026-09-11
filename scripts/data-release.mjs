#!/usr/bin/env node

import {
  DATA_RELEASE_MANIFEST_PATH,
  DATA_RELEASE_STREAMS,
  loadDataRelease,
  refreshDataReleaseStream,
  repositoryRootFromModule,
  validateDataRelease,
  writeDataRelease,
} from "./lib/data-release.mjs";

const root = repositoryRootFromModule();
const args = process.argv.slice(2);
const shouldWrite = args.includes("--write");
const streamFlag = args.indexOf("--stream");
const requestedStream = streamFlag >= 0 ? args[streamFlag + 1] : null;
const promotedAtFlag = args.indexOf("--promoted-at");
const requestedPromotedAt =
  promotedAtFlag >= 0 ? args[promotedAtFlag + 1] : null;

function fail(message) {
  console.error(`data-release: ${message}`);
  process.exit(1);
}

let manifest;
try {
  manifest = loadDataRelease(root);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (shouldWrite) {
  if (!requestedStream) fail("--write requires --stream <name|all>");
  if (promotedAtFlag >= 0 && !requestedPromotedAt) {
    fail("--promoted-at requires an ISO UTC timestamp");
  }
  const streamNames = requestedStream === "all"
    ? Object.keys(DATA_RELEASE_STREAMS)
    : [requestedStream];
  const promotedAt = requestedPromotedAt ?? new Date().toISOString();
  try {
    for (const streamName of streamNames) {
      manifest = refreshDataReleaseStream(manifest, streamName, root, promotedAt);
    }
    writeDataRelease(manifest, root);
    console.log(
      `data-release: refreshed ${streamNames.join(", ")} in ${DATA_RELEASE_MANIFEST_PATH}`,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

const result = validateDataRelease(manifest, root);
if (result.errors.length > 0) {
  console.error(`data-release: validation failed (${result.errors.length})`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`data-release: ${result.dataVersion} is valid`);
