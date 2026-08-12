import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_RELEASE_SCHEMA_VERSION = 1;
export const DATA_RELEASE_MANIFEST_PATH = "src/data/data-release.json";

/**
 * Server place truth is not a single JSON file yet. `places.ts` composes the
 * curated spine with reviewed imports and policy tables, while the place page
 * adds a small set of shipped, local context records. Keep the complete input
 * boundary explicit here so changing any one of those facts requires a new
 * promoted data version.
 */
export const PLACE_RELEASE_ARTIFACTS = Object.freeze([
  // Canonical identity and imported place records.
  "src/data/places.ts",
  "src/data/places-dfp.json",
  "src/data/places-discovered.json",
  "src/data/places-enrichment.json",
  "src/data/places-dedup.json",
  "src/data/places-overrides.json",
  "src/data/place-status-overrides.json",
  "src/data/places-hours-refresh.json",
  "src/data/business-status.json",
  // Server-loader editorial and policy inputs.
  "src/data/known-for.json",
  "src/data/photo-suppress.json",
  "src/data/local-favorites.json",
  "src/data/seasonal-places.json",
  "src/data/places-amenities.json",
  "src/data/farmers-markets.json",
  "src/data/descriptions.json",
  "src/data/categories.ts",
  "src/data/municipalities.ts",
  "src/data/events.ts",
  "src/data/cravings.ts",
  "src/data/hidden-gems.ts",
  "src/data/reliable-open-windows.ts",
  "src/lib/relevance.ts",
  "src/lib/integrations/closures.ts",
  "src/lib/integrations/wikimedia.ts",
  // Additional immutable facts rendered by the place detail route.
  "src/data/business-info.json",
  "src/data/field-notes.json",
  "src/data/course-info.json",
  "src/data/tags.ts",
  "src/data/loc-archive.ts",
  "public/images/seasons/aerial-manifest.json",
  // Published read models and attribution joins.
  "src/data/place-refresh-identities.json",
  "src/data/places-client.json",
  "src/data/places-client-hours.json",
  "src/data/event-venue-photo-credits.json",
]);

/**
 * The promoted data boundary is deliberately small and follows the snapshots
 * the application already ships. Each stream can be refreshed and reviewed
 * independently; the application data version is the deterministic digest of
 * all stream artifacts at build time.
 */
export const DATA_RELEASE_STREAMS = Object.freeze({
  basemap: Object.freeze([
    "src/data/basemap-release.json",
  ]),
  places: PLACE_RELEASE_ARTIFACTS,
  sources: Object.freeze([
    "src/data/source-registry.generated.json",
  ]),
  transit: Object.freeze([
    "src/data/transit.json",
    "src/data/transit-network.json",
    "src/data/transit-trips.json",
  ]),
  "venue-events": Object.freeze([
    "src/data/venue-event-source-inventory.json",
    "src/data/venue-event-source-state.json",
    "src/data/venue-events.json",
  ]),
});

export function repositoryRootFromModule() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function jsonRecordCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    const publicEntries = Object.entries(value).filter(
      ([key]) => !key.startsWith("_"),
    );
    if (publicEntries.length === 1 && Array.isArray(publicEntries[0][1])) {
      return publicEntries[0][1].length;
    }
    return publicEntries.length;
  }
  return 1;
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
    throw new Error(`artifact path escapes the repository: ${relativePath}`);
  }
  return absolute;
}

export function inspectArtifact(root, relativePath) {
  const absolute = pathWithinRoot(root, relativePath);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${relativePath} must be a regular file`);
  }
  const bytes = readFileSync(absolute);
  const extension = extname(relativePath);
  let records = null;
  if (extension === ".json") {
    let value;
    try {
      value = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${relativePath} is not valid JSON: ${detail}`);
    }
    records = jsonRecordCount(value);
  } else if (extension !== ".ts") {
    throw new Error(
      `${relativePath} has unsupported release artifact type ${extension || "(none)"}`,
    );
  }
  return {
    path: relativePath,
    sha256: sha256(bytes),
    // TypeScript data modules are hashed as opaque static inputs. Their
    // application revision owns executable semantics; unlike JSON arrays they
    // do not have a reliable format-independent record count.
    records,
    bytes: bytes.length,
  };
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function artifactFingerprint(streamName, artifact) {
  return [
    streamName,
    artifact.path,
    artifact.sha256,
    String(artifact.records),
    String(artifact.bytes),
  ].join("\0");
}

export function dataReleaseId(manifest) {
  const lines = [];
  for (const streamName of Object.keys(DATA_RELEASE_STREAMS).sort()) {
    const stream = manifest?.streams?.[streamName];
    const artifacts = [...(stream?.artifacts ?? [])].sort((a, b) =>
      String(a?.path).localeCompare(String(b?.path)),
    );
    for (const artifact of artifacts) {
      lines.push(artifactFingerprint(streamName, artifact));
    }
  }
  return `sha256:${sha256(lines.join("\n"))}`;
}

export function validateDataRelease(manifest, root = repositoryRootFromModule()) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { errors: ["manifest must contain an object"], dataVersion: null };
  }
  if (manifest.schema_version !== DATA_RELEASE_SCHEMA_VERSION) {
    errors.push(
      `schema_version must be ${DATA_RELEASE_SCHEMA_VERSION}, received ${String(manifest.schema_version)}`,
    );
  }
  const streams = manifest.streams;
  if (!streams || typeof streams !== "object" || Array.isArray(streams)) {
    return { errors: [...errors, "streams must contain an object"], dataVersion: null };
  }

  const expectedStreamNames = Object.keys(DATA_RELEASE_STREAMS).sort();
  const actualStreamNames = Object.keys(streams).sort();
  for (const streamName of expectedStreamNames) {
    if (!actualStreamNames.includes(streamName)) {
      errors.push(`missing required stream: ${streamName}`);
    }
  }
  for (const streamName of actualStreamNames) {
    if (!expectedStreamNames.includes(streamName)) {
      errors.push(`unknown stream: ${streamName}`);
    }
  }

  for (const streamName of expectedStreamNames) {
    const stream = streams[streamName];
    if (!stream || typeof stream !== "object" || Array.isArray(stream)) continue;
    if (!isIsoTimestamp(stream.promoted_at)) {
      errors.push(`${streamName}.promoted_at must be an ISO UTC timestamp`);
    }
    if (!Array.isArray(stream.artifacts)) {
      errors.push(`${streamName}.artifacts must be an array`);
      continue;
    }
    const expectedPaths = [...DATA_RELEASE_STREAMS[streamName]].sort();
    const actualPaths = stream.artifacts
      .map((artifact) => artifact?.path)
      .filter((path) => typeof path === "string")
      .sort();
    if (new Set(actualPaths).size !== actualPaths.length) {
      errors.push(`${streamName}.artifacts contains duplicate paths`);
    }
    for (const expectedPath of expectedPaths) {
      if (!actualPaths.includes(expectedPath)) {
        errors.push(`${streamName} is missing ${expectedPath}`);
      }
    }
    for (const actualPath of actualPaths) {
      if (!expectedPaths.includes(actualPath)) {
        errors.push(`${streamName} contains unknown artifact ${actualPath}`);
      }
    }

    for (const artifact of stream.artifacts) {
      if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
        errors.push(`${streamName} contains a malformed artifact entry`);
        continue;
      }
      if (typeof artifact.path !== "string") {
        errors.push(`${streamName} contains an artifact without a path`);
        continue;
      }
      if (!expectedPaths.includes(artifact.path)) {
        continue;
      }
      let current;
      try {
        current = inspectArtifact(root, artifact.path);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      if (artifact.sha256 !== current.sha256) {
        errors.push(
          `${artifact.path} digest differs from the promoted release; refresh and review the ${streamName} stream`,
        );
      }
      if (artifact.records !== current.records) {
        errors.push(
          `${artifact.path} record count differs: manifest=${String(artifact.records)} current=${current.records}`,
        );
      }
      if (artifact.bytes !== current.bytes) {
        errors.push(
          `${artifact.path} byte count differs: manifest=${String(artifact.bytes)} current=${current.bytes}`,
        );
      }
    }
  }

  const computedDataVersion = dataReleaseId(manifest);
  if (manifest.data_version !== computedDataVersion) {
    errors.push(
      `data_version differs from the promoted artifacts: manifest=${String(manifest.data_version)} computed=${computedDataVersion}`,
    );
  }

  return {
    errors,
    dataVersion: errors.length === 0 ? computedDataVersion : null,
  };
}

export function loadDataRelease(root = repositoryRootFromModule()) {
  const manifestPath = pathWithinRoot(root, DATA_RELEASE_MANIFEST_PATH);
  const bytes = readFileSync(manifestPath, "utf8");
  return JSON.parse(bytes);
}

export function refreshDataReleaseStream(
  manifest,
  streamName,
  root = repositoryRootFromModule(),
  promotedAt = new Date().toISOString(),
) {
  const paths = DATA_RELEASE_STREAMS[streamName];
  if (!paths) throw new Error(`unknown data release stream: ${streamName}`);
  if (!isIsoTimestamp(promotedAt)) {
    throw new Error("promotedAt must be an ISO UTC timestamp");
  }
  const refreshed = {
    ...manifest,
    schema_version: DATA_RELEASE_SCHEMA_VERSION,
    streams: {
      ...(manifest?.streams ?? {}),
      [streamName]: {
        promoted_at: promotedAt,
        artifacts: paths.map((path) => inspectArtifact(root, path)),
      },
    },
  };
  return {
    ...refreshed,
    data_version: dataReleaseId(refreshed),
  };
}

export function writeDataRelease(manifest, root = repositoryRootFromModule()) {
  const manifestPath = pathWithinRoot(root, DATA_RELEASE_MANIFEST_PATH);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
