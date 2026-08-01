import assert from "node:assert/strict";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_ENV_EXAMPLE_PATH,
  DEFAULT_RELEASE_ROOT,
  PUBLIC_HUB_DESTINATIONS,
  generateProjectHub,
  validateEnvExample,
  validateProjectHub,
  validateReleaseSource,
} from "../scripts/public-project-hub.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cleanupPaths = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((pathname) => rm(pathname, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(label) {
  const directory = await mkdtemp(join(tmpdir(), `frederick-radius-${label}-`));
  cleanupPaths.push(directory);
  return directory;
}

async function collectFiles(root, relativeDirectory = "") {
  const files = [];
  const directory = relativeDirectory ? join(root, relativeDirectory) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isDirectory())
      files.push(...(await collectFiles(root, relativePath)));
    else files.push(relativePath);
  }
  return files.sort();
}

async function copyReleaseFixture() {
  const root = await temporaryDirectory("release-fixture");
  const releaseRoot = join(root, "public-release");
  await cp(DEFAULT_RELEASE_ROOT, releaseRoot, {
    recursive: true,
    errorOnExist: true,
  });
  return releaseRoot;
}

test("the checked-in public release source matches the strict manifest", async () => {
  const release = await validateReleaseSource();
  assert.equal(release.files.length, PUBLIC_HUB_DESTINATIONS.length);
  assert.deepEqual(
    release.files.map((entry) => entry.destination),
    PUBLIC_HUB_DESTINATIONS,
  );
});

test("the checked-in environment example has unique variable names", async () => {
  const result = await validateEnvExample(DEFAULT_ENV_EXAMPLE_PATH);
  assert.ok(result.names.includes("MEMBER_COOKIE_SECRET"));
  assert.ok(result.names.includes("BETA_CODE_SECRET"));
  assert.equal(result.names.length, new Set(result.names).size);
});

test("environment validation reports duplicate variable names", async () => {
  const root = await temporaryDirectory("duplicate-env");
  const envExample = join(root, ".env.example");
  await writeFile(envExample, "ONE=\nTWO=\nONE=\n");

  await assert.rejects(
    validateEnvExample(envExample),
    /repeats ONE on lines 1 and 3/u,
  );
});

test("generate emits only approved files and no Git metadata", async () => {
  const root = await temporaryDirectory("generate");
  const destination = join(root, "public-hub");

  const generated = await generateProjectHub(destination);
  const validated = await validateProjectHub(destination);

  assert.equal(generated.outputRoot, destination);
  assert.deepEqual(
    await collectFiles(destination),
    [...PUBLIC_HUB_DESTINATIONS].sort(),
  );
  assert.deepEqual(validated.files, PUBLIC_HUB_DESTINATIONS);
  await assert.rejects(lstat(join(destination, ".git")), { code: "ENOENT" });
});

test("generate accepts an existing empty destination", async () => {
  const root = await temporaryDirectory("empty-destination");
  const destination = join(root, "public-hub");
  await mkdir(destination);

  await generateProjectHub(destination);
  await validateProjectHub(destination);
});

test("generate refuses a non-empty destination without changing it", async () => {
  const root = await temporaryDirectory("non-empty-destination");
  const destination = join(root, "public-hub");
  await mkdir(destination);
  await writeFile(join(destination, "keep.txt"), "keep me\n");

  await assert.rejects(
    generateProjectHub(destination),
    /destination must be empty/u,
  );
  assert.equal(
    await readFile(join(destination, "keep.txt"), "utf8"),
    "keep me\n",
  );
});

test("source validation fails closed on an unknown template file", async () => {
  const releaseRoot = await copyReleaseFixture();
  await writeFile(
    join(releaseRoot, "templates", "NOT_APPROVED.md"),
    "not approved\n",
  );

  await assert.rejects(
    validateReleaseSource(releaseRoot),
    /unknown file: NOT_APPROVED\.md/u,
  );
});

test("source validation rejects content that no longer matches its digest", async () => {
  const releaseRoot = await copyReleaseFixture();
  await writeFile(join(releaseRoot, "templates", "README.md"), "tampered\n");

  await assert.rejects(
    validateReleaseSource(releaseRoot),
    /template size does not match manifest/u,
  );
});

test("output validation rejects unknown files", async () => {
  const root = await temporaryDirectory("unknown-output");
  const destination = join(root, "public-hub");
  await generateProjectHub(destination);
  await writeFile(join(destination, "production-data.json"), "{}\n");

  await assert.rejects(
    validateProjectHub(destination),
    /unknown file: production-data\.json/u,
  );
});

test("output validation rejects symlinks", async () => {
  const root = await temporaryDirectory("symlink-output");
  const destination = join(root, "public-hub");
  await generateProjectHub(destination);
  await rm(join(destination, "README.md"));
  await symlink(join(destination, "LICENSE"), join(destination, "README.md"));

  await assert.rejects(
    validateProjectHub(destination),
    /forbidden symlink: README\.md/u,
  );
});

test("generate refuses destinations inside the private worktree", async () => {
  const destination = join(REPOSITORY_ROOT, ".public-hub-test-output");
  await assert.rejects(
    generateProjectHub(destination),
    /outside the private production worktree/u,
  );
  await assert.rejects(lstat(destination), { code: "ENOENT" });
});
