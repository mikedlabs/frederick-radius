import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  DATA_RELEASE_STREAMS,
  PLACE_RELEASE_ARTIFACTS,
  dataReleaseId,
  inspectArtifact,
  loadDataRelease,
  refreshDataReleaseStream,
  repositoryRootFromModule,
  validateDataRelease,
} from "./data-release.mjs";

const FIXED_PROMOTION = "2026-08-12T12:00:00Z";

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "radius-data-release-"));
  for (const paths of Object.values(DATA_RELEASE_STREAMS)) {
    for (const path of paths) {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(
        absolute,
        path.endsWith(".json")
          ? `${JSON.stringify([{ path }])}\n`
          : `export const fixture = ${JSON.stringify(path)};\n`,
      );
    }
  }
  return root;
}

function fixtureManifest(root) {
  let manifest = { schema_version: 1, streams: {} };
  for (const streamName of Object.keys(DATA_RELEASE_STREAMS)) {
    manifest = refreshDataReleaseStream(
      manifest,
      streamName,
      root,
      FIXED_PROMOTION,
    );
  }
  return manifest;
}

test("checked-in promoted data manifest matches every protected artifact", () => {
  const root = repositoryRootFromModule();
  const result = validateDataRelease(loadDataRelease(root), root);
  assert.deepEqual(result.errors, []);
  assert.match(result.dataVersion, /^sha256:[0-9a-f]{64}$/);
});

test("the recorded public data version must match the protected artifacts", () => {
  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const result = validateDataRelease(
    { ...manifest, data_version: "sha256:stale" },
    root,
  );

  assert.equal(result.dataVersion, null);
  assert.ok(result.errors.some((error) => /data_version differs/.test(error)));
});

test("the place release covers canonical server and place-page inputs", () => {
  const required = [
    "src/data/places.ts",
    "src/data/places-dfp.json",
    "src/data/places-discovered.json",
    "src/data/places-enrichment.json",
    "src/data/places-overrides.json",
    "src/data/place-status-overrides.json",
    "src/data/categories.ts",
    "src/data/municipalities.ts",
    "src/data/events.ts",
    "src/lib/relevance.ts",
    "src/lib/integrations/closures.ts",
    "src/lib/integrations/wikimedia.ts",
    "src/data/business-info.json",
    "src/data/field-notes.json",
    "src/data/course-info.json",
    "src/data/tags.ts",
    "src/data/loc-archive.ts",
    "public/images/seasons/aerial-manifest.json",
    "src/data/places-client.json",
  ];

  assert.deepEqual(
    required.filter((path) => !PLACE_RELEASE_ARTIFACTS.includes(path)),
    [],
  );
});

test("TypeScript data modules are digest-protected without fake record counts", () => {
  const root = fixtureRoot();
  const artifact = inspectArtifact(root, "src/data/places.ts");

  assert.equal(artifact.records, null);
  assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
  assert.ok(artifact.bytes > 0);
});

test("release ids are deterministic across manifest key order", () => {
  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const reversed = {
    ...manifest,
    streams: Object.fromEntries(
      Object.entries(manifest.streams)
        .reverse()
        .map(([name, stream]) => [
          name,
          { ...stream, artifacts: [...stream.artifacts].reverse() },
        ]),
    ),
  };
  assert.equal(dataReleaseId(reversed), dataReleaseId(manifest));
});

test("validation fails when a promoted artifact changes on disk", () => {
  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const target = resolve(root, DATA_RELEASE_STREAMS.places[0]);
  writeFileSync(target, `${readFileSync(target, "utf8").trim()} `);

  const result = validateDataRelease(manifest, root);
  assert.equal(result.dataVersion, null);
  assert.ok(result.errors.some((error) => /digest differs/.test(error)));
});

test("refreshing one stream preserves the other stream promotions", () => {
  const root = fixtureRoot();
  const manifest = fixtureManifest(root);
  const updated = refreshDataReleaseStream(
    manifest,
    "places",
    root,
    "2026-08-13T12:00:00Z",
  );

  assert.equal(updated.streams.places.promoted_at, "2026-08-13T12:00:00Z");
  assert.equal(updated.streams["venue-events"].promoted_at, FIXED_PROMOTION);
  assert.equal(updated.data_version, dataReleaseId(updated));
});
