import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const BASEMAP_RELEASE_SCHEMA_VERSION = 1;
export const BASEMAP_RELEASE_MANIFEST_PATH = "src/data/basemap-release.json";

export function repositoryRootFromBasemapModule() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function pathWithinRoot(root, relativePath) {
  const absolute = resolve(root, relativePath);
  const fromRoot = relative(root, absolute);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    resolve(root, fromRoot) !== absolute
  ) {
    throw new Error(`basemap path escapes the repository: ${relativePath}`);
  }
  return absolute;
}

function validSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function validHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function assetError(asset) {
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    return "manifest contains a malformed basemap asset";
  }
  if (
    typeof asset.path !== "string" ||
    !asset.path.startsWith("public/basemap/")
  ) {
    return "basemap asset path must stay under public/basemap";
  }
  if (!validSha256(asset.sha256)) {
    return `${asset.path} has an invalid sha256`;
  }
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) {
    return `${asset.path} has an invalid byte count`;
  }
  if (!validHttpsUrl(asset.source_url)) {
    return `${asset.path} must name an immutable HTTPS source`;
  }
  return null;
}

export function loadBasemapRelease(root = repositoryRootFromBasemapModule()) {
  return JSON.parse(
    readFileSync(pathWithinRoot(root, BASEMAP_RELEASE_MANIFEST_PATH), "utf8"),
  );
}

export function validateBasemapReleaseManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["basemap release manifest must contain an object"];
  }
  if (manifest.schema_version !== BASEMAP_RELEASE_SCHEMA_VERSION) {
    errors.push(
      `basemap schema_version must be ${BASEMAP_RELEASE_SCHEMA_VERSION}`,
    );
  }
  if (
    typeof manifest.release_id !== "string" ||
    !/^[a-z0-9-]+$/.test(manifest.release_id)
  ) {
    errors.push("basemap release_id must be a stable lowercase identifier");
  }
  if (!isIsoTimestamp(manifest.promoted_at)) {
    errors.push("basemap promoted_at must be an ISO UTC timestamp");
  }
  if (manifest.materialized_at_build !== false) {
    errors.push("basemap materialized_at_build must remain false");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    errors.push("basemap release must contain assets");
    return errors;
  }
  const paths = manifest.assets.map((asset) => asset?.path);
  if (new Set(paths).size !== paths.length) {
    errors.push("basemap release contains duplicate asset paths");
  }
  if (!paths.includes("public/basemap/frederick-county.pmtiles")) {
    errors.push("basemap release is missing the county PMTiles artifact");
  }
  for (const asset of manifest.assets) {
    const error = assetError(asset);
    if (error) errors.push(error);
  }
  return errors;
}

export function sha256File(path) {
  return new Promise((resolveDigest, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(path);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolveDigest(hash.digest("hex")));
  });
}

export async function inspectBasemapAsset(root, asset) {
  const absolute = pathWithinRoot(root, asset.path);
  if (!existsSync(absolute)) {
    return { ok: false, error: `${asset.path} is missing` };
  }
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { ok: false, error: `${asset.path} must be a regular file` };
  }
  if (stat.size !== asset.bytes) {
    return {
      ok: false,
      error:
        `${asset.path} byte count differs: manifest=${asset.bytes} ` +
        `current=${stat.size}`,
    };
  }
  const digest = await sha256File(absolute);
  if (digest !== asset.sha256) {
    return {
      ok: false,
      error: `${asset.path} digest differs from its promoted release`,
    };
  }
  return { ok: true };
}

export async function verifyBasemapRelease(
  manifest,
  root = repositoryRootFromBasemapModule(),
) {
  const errors = validateBasemapReleaseManifest(manifest);
  if (errors.length > 0) return { errors };
  const checks = await Promise.all(
    manifest.assets.map((asset) => inspectBasemapAsset(root, asset)),
  );
  for (const check of checks) {
    if (!check.ok) errors.push(check.error);
  }
  return { errors };
}

/**
 * Refresh digests only after a separately materialized candidate has been
 * reviewed. Source URLs and the release id remain explicit reviewer inputs;
 * this function never downloads, uploads, or invents provenance.
 */
export async function refreshBasemapRelease(
  manifest,
  releaseId,
  root = repositoryRootFromBasemapModule(),
  promotedAt = new Date().toISOString(),
) {
  const errors = validateBasemapReleaseManifest(manifest).filter(
    (error) => !error.startsWith("basemap release_id") &&
      !error.startsWith("basemap promoted_at"),
  );
  if (errors.length > 0) throw new Error(errors.join("; "));
  if (!/^[a-z0-9-]+$/.test(releaseId)) {
    throw new Error("releaseId must be a stable lowercase identifier");
  }
  if (!isIsoTimestamp(promotedAt)) {
    throw new Error("promotedAt must be an ISO UTC timestamp");
  }
  const assets = [];
  for (const asset of manifest.assets) {
    const absolute = pathWithinRoot(root, asset.path);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`${asset.path} must be a regular file`);
    }
    assets.push({
      ...asset,
      sha256: await sha256File(absolute),
      bytes: stat.size,
    });
  }
  return {
    ...manifest,
    release_id: releaseId,
    promoted_at: promotedAt,
    materialized_at_build: false,
    assets,
  };
}

export function writeBasemapRelease(
  manifest,
  root = repositoryRootFromBasemapModule(),
) {
  writeFileSync(
    pathWithinRoot(root, BASEMAP_RELEASE_MANIFEST_PATH),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}
