import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  loadBasemapRelease,
  refreshBasemapRelease,
  repositoryRootFromBasemapModule,
  verifyBasemapRelease,
} from "./basemap-release.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "radius-basemap-release-"));
  const path = "public/basemap/frederick-county.pmtiles";
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), "promoted-map");
  return {
    root,
    manifest: {
      schema_version: 1,
      release_id: "fixture-v1",
      promoted_at: "2026-08-12T12:00:00Z",
      materialized_at_build: false,
      assets: [
        {
          path,
          sha256: "0".repeat(64),
          bytes: 12,
          source_url: "https://build.protomaps.com/20260722.pmtiles",
        },
      ],
    },
  };
}

test("checked-in basemap release is present and digest-verified", async () => {
  const root = repositoryRootFromBasemapModule();
  const result = await verifyBasemapRelease(loadBasemapRelease(root), root);
  assert.deepEqual(result.errors, []);
});

test("verification fails closed when an artifact digest differs", async () => {
  const { root, manifest } = fixture();
  const result = await verifyBasemapRelease(manifest, root);
  assert.ok(result.errors.some((error) => /digest differs/.test(error)));
});

test("promotion refresh is local and deterministic for a fixed timestamp", async () => {
  const { root, manifest } = fixture();
  const promoted = await refreshBasemapRelease(
    manifest,
    "fixture-v2",
    root,
    "2026-08-13T12:00:00Z",
  );
  const repeated = await refreshBasemapRelease(
    manifest,
    "fixture-v2",
    root,
    "2026-08-13T12:00:00Z",
  );

  assert.deepEqual(promoted, repeated);
  assert.equal(promoted.release_id, "fixture-v2");
  assert.equal(promoted.assets[0].bytes, 12);
  assert.match(promoted.assets[0].sha256, /^[0-9a-f]{64}$/);
});
