/**
 * Production-canary recovery.
 *
 * A failed apex check is not enough reason to point traffic at an arbitrary
 * old build. This script reads only READY production deployments on the main
 * project, finds the deployment immediately before the expected bad SHA, and
 * runs the same public canary against that immutable deployment URL. Only a
 * passing candidate is eligible for Vercel Instant Rollback.
 *
 * Required:
 *   EXPECTED_SHA   commit whose production promotion failed the apex canary
 *   VERCEL_TOKEN   narrowly scoped Vercel access token stored in GitHub
 *
 * Optional:
 *   VERCEL_SCOPE   defaults to mikedlab
 *   VERCEL_PROJECT defaults to frederick-radius
 */
import { spawnSync } from "node:child_process";
import {
  selectPreviousMainDeployment,
} from "./lib/production-rollback.mjs";

const EXPECTED_SHA = process.env.EXPECTED_SHA?.trim().toLowerCase() ?? "";
const TOKEN = process.env.VERCEL_TOKEN?.trim() ?? "";
const SCOPE = process.env.VERCEL_SCOPE?.trim() || "mikedlab";
const PROJECT = process.env.VERCEL_PROJECT?.trim() || "frederick-radius";
const VERCEL = process.env.VERCEL_CLI?.trim() || "vercel";

function fail(message) {
  console.error(`[production-recovery] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  if (result.error) {
    fail(`${command} could not start: ${result.error.message}`);
  }
  return result;
}

if (!EXPECTED_SHA) fail("EXPECTED_SHA is required; refusing an unscoped rollback.");
if (!TOKEN) {
  fail(
    "VERCEL_TOKEN is not configured. Production remains unchanged; add the repository secret before relying on automatic recovery.",
  );
}

const listed = run(
  VERCEL,
  [
    "list",
    PROJECT,
    "--environment",
    "production",
    "--status",
    "READY",
    "--format",
    "json",
    "--scope",
    SCOPE,
    "--token",
    TOKEN,
    "--yes",
  ],
  { capture: true },
);
if (listed.status !== 0) fail("Vercel could not list production deployments.");

let payload;
try {
  payload = JSON.parse(listed.stdout);
} catch {
  fail("Vercel returned an unreadable deployment list.");
}

const selected = selectPreviousMainDeployment(payload, EXPECTED_SHA);
if (selected.error === "expected-deployment-missing") {
  fail(
    `The promoted SHA ${EXPECTED_SHA.slice(0, 12)} was not found in READY production history; refusing to guess.`,
  );
}
if (selected.error === "newer-main-deployment-present") {
  fail(
    "A newer READY main deployment already exists; refusing to let an older canary change production.",
  );
}
const candidate = selected.candidate;
if (!candidate) fail("No earlier main-branch production deployment is eligible.");

const candidateUrl = `https://${candidate.url}`;
const candidateSha = String(candidate.meta.githubCommitSha).toLowerCase();
console.log(
  `[production-recovery] validating ${candidateSha.slice(0, 12)} before changing the apex alias`,
);
const candidateCheck = run(
  process.execPath,
  ["scripts/prod-audit.mjs"],
  {
    env: {
      BASE_URL: candidateUrl,
      EXPECTED_SHA: candidateSha,
      REQUIRE_EXPECTED_SHA: "1",
      SKIP_DATA_HEALTH: "1",
    },
  },
);
if (candidateCheck.status !== 0) {
  fail("The previous deployment did not pass the public canary; production remains unchanged.");
}

console.log(
  `[production-recovery] restoring ${candidateSha.slice(0, 12)} to production`,
);
const rollback = run(VERCEL, [
  "rollback",
  candidateUrl,
  "--yes",
  "--timeout",
  "3m",
  "--scope",
  SCOPE,
  "--token",
  TOKEN,
]);
if (rollback.status !== 0) fail("Vercel rejected the rollback request.");

const apexCheck = run(process.execPath, ["scripts/prod-audit.mjs"], {
  env: {
    BASE_URL: process.env.BASE_URL || "https://frederickradius.app",
    EXPECTED_SHA: candidateSha,
    REQUIRE_EXPECTED_SHA: "1",
    SKIP_DATA_HEALTH: "1",
  },
});
if (apexCheck.status !== 0) {
  fail("Rollback completed, but the apex verification is still red.");
}

console.log(
  `[production-recovery] apex restored to ${candidateSha.slice(0, 12)}`,
);
