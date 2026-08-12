import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const guardUrl = pathToFileURL(
  resolve(root, "scripts/promoted-build-network-guard.mjs"),
).href;

function guardedNode(source) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      RADIUS_DATA_MODE: "promoted",
      NODE_OPTIONS: `--import=${guardUrl}`,
    },
  });
}

test("the build preload blocks fetch before application modules run", () => {
  const child = guardedNode(`
    try {
      await fetch("https://publisher.example/events?api_key=secret");
      process.exitCode = 2;
    } catch (error) {
      console.log(error.message);
    }
  `);

  assert.equal(child.status, 0, child.stderr);
  assert.match(
    child.stdout,
    /External network blocked during promoted-data build: https:\/\/publisher\.example\/events/,
  );
  assert.doesNotMatch(child.stdout, /api_key|secret/);
});

test("the build preload also blocks direct Node HTTPS clients", () => {
  const child = guardedNode(`
    const https = await import("node:https");
    try {
      https.default.get("https://publisher.example/feed?token=secret");
      process.exitCode = 2;
    } catch (error) {
      console.log(error.message);
    }
  `);

  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /https:\/\/publisher\.example\/feed/);
  assert.doesNotMatch(child.stdout, /token|secret/);
});

test("the build preload marks every inherited worker as promoted", () => {
  const child = guardedNode(`
    console.log(JSON.stringify({
      globalMarker:
        globalThis[Symbol.for("frederick-radius.promoted-data-build")] === true,
      processMarker:
        process[Symbol.for("frederick-radius.promoted-data-build")] === true,
      fetchMarker: fetch.__radiusPromotedBuildFetchGuard === true,
    }));
  `);

  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    globalMarker: true,
    processMarker: true,
    fetchMarker: true,
  });
});
