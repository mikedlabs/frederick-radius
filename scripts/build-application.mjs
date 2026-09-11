#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadDataRelease,
  repositoryRootFromModule,
  validateDataRelease,
} from "./lib/data-release.mjs";
import { hostedBuildCredentialErrors } from "./lib/hosted-build-credentials.mjs";
import { buildFairPhotoViewer } from "./build-fair-photo-viewer.mjs";

const root = repositoryRootFromModule();
const credentialErrors = hostedBuildCredentialErrors();
if (credentialErrors.length > 0) {
  console.error("build-application: hosted release credentials are invalid");
  for (const error of credentialErrors) console.error(`  - ${error}`);
  process.exit(1);
}
const manifest = loadDataRelease(root);
const result = validateDataRelease(manifest, root);

if (result.errors.length > 0 || !result.dataVersion) {
  console.error("build-application: promoted data release is invalid");
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`build-application: using promoted data ${result.dataVersion}`);
await buildFairPhotoViewer();

const nextBin = resolve(root, "node_modules/next/dist/bin/next");
const networkGuard = pathToFileURL(
  resolve(root, "scripts/promoted-build-network-guard.mjs"),
).href;
const nodeOptions = [
  process.env.NODE_OPTIONS,
  `--import=${networkGuard}`,
].filter(Boolean).join(" ");
const child = spawnSync(
  process.execPath,
  [nextBin, "build", ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      RADIUS_DATA_MODE: "promoted",
      RADIUS_DATA_VERSION: result.dataVersion,
      NEXT_PUBLIC_RADIUS_DATA_VERSION: result.dataVersion,
      NODE_OPTIONS: nodeOptions,
    },
  },
);

if (child.error) throw child.error;
process.exit(child.status ?? 1);
