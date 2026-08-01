#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), "..");

export const DEFAULT_RELEASE_ROOT = resolve(REPOSITORY_ROOT, "public-release");
export const DEFAULT_ENV_EXAMPLE_PATH = resolve(
  REPOSITORY_ROOT,
  ".env.example",
);

export const PUBLIC_HUB_DESTINATIONS = Object.freeze([
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SUPPORT.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA_BOUNDARIES.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".gitignore",
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "manifestVersion",
  "project",
  "artifact",
  "policy",
  "files",
]);
const POLICY_KEYS = Object.freeze([
  "documentationOnly",
  "allowProductionSource",
  "allowProductionData",
  "allowMedia",
  "allowWorkflows",
  "allowGitMetadata",
]);
const FILE_KEYS = Object.freeze([
  "source",
  "destination",
  "mediaType",
  "bytes",
  "sha256",
]);
const REQUIRED_POLICY = Object.freeze({
  documentationOnly: true,
  allowProductionSource: false,
  allowProductionData: false,
  allowMedia: false,
  allowWorkflows: false,
  allowGitMetadata: false,
});
const ALLOWED_EMAILS = new Set(["hello@frederickradius.app"]);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const SECRET_PATTERNS = Object.freeze([
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u],
  [
    "GitHub token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
  ],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ["OpenAI secret key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u],
  ["Mapbox secret token", /\bsk\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u],
  [
    "JSON web token",
    /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/u,
  ],
]);

function fail(message) {
  throw new Error(message);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} has unexpected or missing keys`);
  }
}

function assertSafeRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  if (
    value.includes("\\") ||
    value.includes("\0") ||
    isAbsolute(value) ||
    value === "." ||
    posix.normalize(value) !== value ||
    value.startsWith("../")
  ) {
    fail(`${label} is not a safe relative POSIX path: ${value}`);
  }
}

function isPathWithin(parent, candidate) {
  const result = relative(parent, candidate);
  return (
    result === "" ||
    (!result.startsWith(`..${sep}`) && result !== ".." && !isAbsolute(result))
  );
}

function expectedMediaType(destination) {
  if (destination.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (destination.endsWith(".yml")) return "application/yaml; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function validateText(buffer, label) {
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail(`${label} must be valid UTF-8`);
  }

  if (content.length === 0) fail(`${label} must not be empty`);
  if (content.charCodeAt(0) === 0xfeff)
    fail(`${label} must not contain a UTF-8 BOM`);
  if (content.includes("\0")) fail(`${label} must not contain NUL bytes`);
  if (content.includes("\r")) fail(`${label} must use LF line endings`);

  for (const [name, pattern] of SECRET_PATTERNS) {
    if (pattern.test(content))
      fail(`${label} contains a value shaped like a ${name}`);
  }

  for (const match of content.matchAll(EMAIL_PATTERN)) {
    if (!ALLOWED_EMAILS.has(match[0].toLowerCase())) {
      fail(
        `${label} contains an email address outside the public contact allowlist`,
      );
    }
  }

  return content;
}

async function assertDirectory(pathname, label) {
  let metadata;
  try {
    metadata = await lstat(pathname);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} does not exist`);
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail(`${label} must be a real directory, not a symlink or special file`);
  }
}

async function assertRegularFile(pathname, label) {
  let metadata;
  try {
    metadata = await lstat(pathname);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} does not exist`);
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    fail(`${label} must be a regular file, not a symlink or special file`);
  }
}

export async function validateEnvExample(
  envExamplePath = DEFAULT_ENV_EXAMPLE_PATH,
) {
  const absolutePath = resolve(envExamplePath);
  await assertRegularFile(absolutePath, "environment example");
  const buffer = await readFile(absolutePath);
  const content = validateText(buffer, "environment example");
  const firstLines = new Map();

  for (const [index, rawLine] of content.split("\n").entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/u.exec(line);
    if (!match)
      fail(
        `environment example has an invalid declaration on line ${index + 1}`,
      );

    const name = match[1];
    const firstLine = firstLines.get(name);
    if (firstLine !== undefined) {
      fail(
        `environment example repeats ${name} on lines ${firstLine} and ${index + 1}`,
      );
    }
    firstLines.set(name, index + 1);
  }

  return { path: absolutePath, names: [...firstLines.keys()] };
}

function expectedDirectories(expectedFiles) {
  const directories = new Set();
  for (const file of expectedFiles) {
    let current = posix.dirname(file);
    while (current !== ".") {
      directories.add(current);
      current = posix.dirname(current);
    }
  }
  return directories;
}

async function assertExactTree(root, expectedFiles, label) {
  await assertDirectory(root, label);
  const expectedFileSet = new Set(expectedFiles);
  const expectedDirectorySet = expectedDirectories(expectedFiles);
  const actualFiles = [];

  async function walk(relativeDirectory = "") {
    const absoluteDirectory = relativeDirectory
      ? resolve(root, relativeDirectory)
      : root;
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? posix.join(relativeDirectory, entry.name)
        : entry.name;

      if (entry.isSymbolicLink())
        fail(`${label} contains a forbidden symlink: ${relativePath}`);
      if (entry.isDirectory()) {
        if (!expectedDirectorySet.has(relativePath)) {
          fail(`${label} contains an unknown directory: ${relativePath}`);
        }
        await walk(relativePath);
      } else if (entry.isFile()) {
        if (!expectedFileSet.has(relativePath)) {
          fail(`${label} contains an unknown file: ${relativePath}`);
        }
        actualFiles.push(relativePath);
      } else {
        fail(`${label} contains a forbidden special file: ${relativePath}`);
      }
    }
  }

  await walk();
  if (actualFiles.length !== expectedFileSet.size) {
    const missing = expectedFiles.filter((file) => !actualFiles.includes(file));
    fail(`${label} is missing required files: ${missing.join(", ")}`);
  }
}

function validateManifestShape(manifest) {
  assertExactKeys(manifest, TOP_LEVEL_KEYS, "public-release manifest");
  if (manifest.manifestVersion !== 1)
    fail("public-release manifestVersion must be 1");
  if (manifest.project !== "Frederick Radius")
    fail("public-release project must be Frederick Radius");
  if (manifest.artifact !== "public-project-hub") {
    fail("public-release artifact must be public-project-hub");
  }

  assertExactKeys(manifest.policy, POLICY_KEYS, "public-release policy");
  for (const key of POLICY_KEYS) {
    if (manifest.policy[key] !== REQUIRED_POLICY[key]) {
      fail(
        `public-release policy.${key} must be ${String(REQUIRED_POLICY[key])}`,
      );
    }
  }

  if (!Array.isArray(manifest.files))
    fail("public-release files must be an array");
  if (manifest.files.length !== PUBLIC_HUB_DESTINATIONS.length) {
    fail(
      `public-release manifest must contain exactly ${PUBLIC_HUB_DESTINATIONS.length} files`,
    );
  }

  manifest.files.forEach((entry, index) => {
    const label = `public-release files[${index}]`;
    assertExactKeys(entry, FILE_KEYS, label);
    assertSafeRelativePath(entry.source, `${label}.source`);
    assertSafeRelativePath(entry.destination, `${label}.destination`);

    const expectedDestination = PUBLIC_HUB_DESTINATIONS[index];
    if (entry.destination !== expectedDestination) {
      fail(`${label}.destination must be ${expectedDestination}`);
    }
    if (entry.source !== posix.join("templates", entry.destination)) {
      fail(
        `${label}.source must exactly mirror its destination under templates/`,
      );
    }
    if (entry.mediaType !== expectedMediaType(entry.destination)) {
      fail(`${label}.mediaType does not match ${entry.destination}`);
    }
    if (
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes <= 0 ||
      entry.bytes > 20_000
    ) {
      fail(`${label}.bytes must be an integer between 1 and 20000`);
    }
    if (
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256)
    ) {
      fail(`${label}.sha256 must be a lowercase SHA-256 digest`);
    }
  });
}

export async function validateReleaseSource(
  releaseRoot = DEFAULT_RELEASE_ROOT,
) {
  const absoluteReleaseRoot = resolve(releaseRoot);
  const templatesRoot = resolve(absoluteReleaseRoot, "templates");
  const manifestPath = resolve(absoluteReleaseRoot, "manifest.json");

  await assertDirectory(absoluteReleaseRoot, "public-release directory");
  await assertDirectory(templatesRoot, "public-release templates directory");
  await assertRegularFile(manifestPath, "public-release manifest");

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    fail(`public-release manifest is not valid JSON: ${error.message}`);
  }
  validateManifestShape(manifest);

  const expectedSources = manifest.files.map((entry) =>
    entry.source.slice("templates/".length),
  );
  await assertExactTree(
    templatesRoot,
    expectedSources,
    "public-release templates",
  );

  const files = [];
  for (const entry of manifest.files) {
    const absoluteSource = resolve(absoluteReleaseRoot, entry.source);
    if (!isPathWithin(templatesRoot, absoluteSource)) {
      fail(`template escaped the templates directory: ${entry.source}`);
    }
    await assertRegularFile(absoluteSource, `template ${entry.source}`);
    const buffer = await readFile(absoluteSource);
    validateText(buffer, `template ${entry.source}`);
    if (buffer.byteLength !== entry.bytes) {
      fail(`template size does not match manifest: ${entry.source}`);
    }
    if (sha256(buffer) !== entry.sha256) {
      fail(`template digest does not match manifest: ${entry.source}`);
    }
    files.push({ ...entry, buffer });
  }

  return { manifest, files, releaseRoot: absoluteReleaseRoot };
}

async function validateOutputAgainstRelease(outputRoot, release) {
  const destinations = release.files.map((entry) => entry.destination);
  await assertExactTree(outputRoot, destinations, "public project hub");

  for (const entry of release.files) {
    const outputPath = resolve(outputRoot, entry.destination);
    if (!isPathWithin(outputRoot, outputPath))
      fail(`output escaped destination: ${entry.destination}`);
    await assertRegularFile(outputPath, `output ${entry.destination}`);
    const buffer = await readFile(outputPath);
    validateText(buffer, `output ${entry.destination}`);
    if (buffer.byteLength !== entry.bytes || sha256(buffer) !== entry.sha256) {
      fail(`output does not match approved template: ${entry.destination}`);
    }
  }

  return { outputRoot, files: destinations };
}

export async function validateProjectHub(destination, options = {}) {
  if (typeof destination !== "string" || destination.trim() === "") {
    fail("a destination path is required");
  }
  const outputRoot = resolve(destination);
  const release = await validateReleaseSource(
    options.releaseRoot ?? DEFAULT_RELEASE_ROOT,
  );
  return validateOutputAgainstRelease(outputRoot, release);
}

async function inspectDestination(outputRoot) {
  if (isPathWithin(REPOSITORY_ROOT, outputRoot)) {
    fail("destination must be outside the private production worktree");
  }

  try {
    const metadata = await lstat(outputRoot);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      fail(
        "destination must be a real directory, not a symlink or special file",
      );
    }
    const entries = await readdir(outputRoot);
    if (entries.length > 0) fail("destination must be empty");
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function generateProjectHub(destination, options = {}) {
  if (typeof destination !== "string" || destination.trim() === "") {
    fail("a destination path is required");
  }

  const outputRoot = resolve(destination);
  const release = await validateReleaseSource(
    options.releaseRoot ?? DEFAULT_RELEASE_ROOT,
  );
  await validateEnvExample(options.envExamplePath ?? DEFAULT_ENV_EXAMPLE_PATH);
  const destinationExisted = await inspectDestination(outputRoot);
  const parent = dirname(outputRoot);
  await mkdir(parent, { recursive: true, mode: 0o755 });
  const stagingRoot = await mkdtemp(
    join(parent, `.frederick-radius-public-hub-${randomUUID()}-`),
  );

  try {
    for (const entry of release.files) {
      const outputPath = resolve(stagingRoot, entry.destination);
      if (!isPathWithin(stagingRoot, outputPath))
        fail(`output escaped staging directory: ${entry.destination}`);
      await mkdir(dirname(outputPath), { recursive: true, mode: 0o755 });
      await writeFile(outputPath, entry.buffer, { flag: "wx", mode: 0o644 });
    }

    await validateOutputAgainstRelease(stagingRoot, release);
    if (destinationExisted) await rmdir(outputRoot);
    await rename(stagingRoot, outputRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }

  return { outputRoot, files: release.files.map((entry) => entry.destination) };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/public-project-hub.mjs check",
    "  node scripts/public-project-hub.mjs generate <empty-or-new-destination>",
    "  node scripts/public-project-hub.mjs validate <destination>",
    "",
    "The generator writes documentation only. It does not initialize Git, add a remote, or call GitHub.",
  ].join("\n");
}

async function main(args) {
  const [command, destination, ...extra] = args;
  if (extra.length > 0) fail(`too many arguments\n\n${usage()}`);

  if (command === "check" && destination === undefined) {
    const release = await validateReleaseSource();
    const env = await validateEnvExample();
    console.log(
      `Public project hub source is valid (${release.files.length} files; ${env.names.length} unique environment names).`,
    );
    return;
  }
  if (command === "generate" && destination !== undefined) {
    const result = await generateProjectHub(destination);
    console.log(
      `Generated ${result.files.length} approved files at ${result.outputRoot}`,
    );
    return;
  }
  if (command === "validate" && destination !== undefined) {
    const result = await validateProjectHub(destination);
    console.log(
      `Public project hub is valid (${result.files.length} files): ${result.outputRoot}`,
    );
    return;
  }

  fail(usage());
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Public project hub error: ${error.message}`);
    process.exitCode = 1;
  });
}
