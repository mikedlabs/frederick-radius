import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prunePipelineArtifacts } from "../pipeline/lib/artifact_retention";

function put(root: string, relative: string, body = "{}") {
  const path = join(root, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

test("keeps last-good clean and raw data while pruning obsolete artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "radius-retention-"));
  try {
    put(root, "clean/alpha.json");
    put(root, "clean/alpha.geojson");
    put(root, "clean/bravo.json");
    put(root, "clean/removed.json");
    put(root, "raw/alpha/2026-07-28.json");
    put(root, "raw/alpha/2026-07-29.http-error.json");
    put(root, "raw/alpha/2026-07-30.json");
    put(root, "raw/alpha/2026-07-31.schema-error.json");
    put(root, "raw/bravo/2026-07-27.json");
    put(root, "raw/bravo/2026-07-31.invalid.txt", "bad");
    put(root, "raw/removed/2026-07-30.json");

    prunePipelineArtifacts({
      dataRoot: root,
      managedSourceIds: new Set(["alpha", "bravo"]),
      successfulFormats: new Map([["alpha", "geojson"]]),
      today: "2026-07-31",
    });

    assert.deepEqual(readdirSync(join(root, "clean")).sort(), [
      "alpha.geojson",
      "bravo.json",
    ]);
    assert.deepEqual(readdirSync(join(root, "raw", "alpha")).sort(), [
      "2026-07-30.json",
      "2026-07-31.schema-error.json",
    ]);
    assert.deepEqual(readdirSync(join(root, "raw", "bravo")).sort(), [
      "2026-07-27.json",
      "2026-07-31.invalid.txt",
    ]);
    assert.deepEqual(readdirSync(join(root, "raw")).sort(), ["alpha", "bravo"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
